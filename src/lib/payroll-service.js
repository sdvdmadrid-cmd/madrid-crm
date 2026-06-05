import "server-only";

import {
  calculatePayrollRunItem,
  normalizeYtdTotals,
  payPeriodsPerYear,
  summarizePayrollRunItems,
} from "./payroll-calculator.js";
import { MUTABLE_RUN_STATUSES, PAYROLL_TABLES } from "./payroll-constants.js";
import { refreshLaborTotalsForRun } from "./payroll-job-costing.js";
import { createPayrollExpenseRecordsForRun } from "./payroll-accounting.js";
import { logPayrollAudit } from "./payroll-corrections.js";
import { getCompanyDocumentBranding } from "./company-document-branding.js";
import { sendPayrollApprovalEmail } from "./payroll-email-notifications.js";
import { loadPayrollTaxTables } from "./payroll-tax-tables-server.js";
import { roundMoney } from "./payroll-money.js";
import {
  applyEmployeeSettingsDefaults,
  getPayrollSettingsForTenant,
  resolveRunItemHours,
  taxTablesForEmployee,
} from "./payroll-settings-service.js";
import {
  serializePayrollEmployee,
  serializePayrollRun,
  serializePayrollRunItem,
} from "./payroll-serializer.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { scopeByTenant } from "./tenant-scope.js";

export function assertRunMutable(status) {
  if (!MUTABLE_RUN_STATUSES.has(String(status || "").toLowerCase())) {
    throw new Error("This pay run is locked and cannot be modified.");
  }
}

export async function fetchEmployeeYtdBeforeRun({
  tenantDbId,
  role,
  employeeId,
  periodEnd,
  excludeRunId,
}) {
  const map = await fetchBatchEmployeeYtdBeforeRun({
    tenantDbId,
    role,
    employeeIds: [employeeId],
    periodEnd,
    excludeRunId,
  });
  return map.get(employeeId) || normalizeYtdTotals({});
}

export async function fetchBatchEmployeeYtdBeforeRun({
  tenantDbId,
  role,
  employeeIds = [],
  periodEnd,
  excludeRunId,
}) {
  const result = new Map();
  const ids = [...new Set((employeeIds || []).filter(Boolean))];
  for (const id of ids) result.set(id, normalizeYtdTotals({}));

  if (!ids.length) return result;

  const yearStart = `${String(periodEnd).slice(0, 4)}-01-01`;

  let runsQuery = supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .select("id, period_end, status")
    .eq("tenant_id", tenantDbId)
    .gte("period_end", yearStart)
    .lte("period_end", periodEnd)
    .in("status", ["approved", "finalized"]);

  if (excludeRunId) {
    runsQuery = runsQuery.neq("id", excludeRunId);
  }

  const { data: runs, error: runsError } = await scopeByTenant(runsQuery, {
    tenantDbId,
    role,
  });
  if (runsError) throw new Error(runsError.message);

  const runIds = (runs || []).map((r) => r.id);
  if (!runIds.length) return result;

  const { data: items, error: itemsError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("employee_id, gross_pay, net_pay, deductions, ytd_snapshot")
    .in("employee_id", ids)
    .in("run_id", runIds);

  if (itemsError) throw new Error(itemsError.message);

  for (const item of items || []) {
    const ytd = result.get(item.employee_id) || normalizeYtdTotals({});
    ytd.grossPay += Number(item.gross_pay || 0);
    ytd.netPay += Number(item.net_pay || 0);
    const d = item.deductions || {};
    ytd.federalWithholding += Number(d.federalWithholding || 0);
    ytd.stateWithholding += Number(d.stateWithholding || 0);
    ytd.socialSecurity += Number(d.socialSecurity || 0);
    ytd.medicare += Number(d.medicare || 0);
    result.set(item.employee_id, normalizeYtdTotals(ytd));
  }

  return result;
}

export async function calculatePayrollRun({
  tenantDbId,
  role,
  runId,
}) {
  const { data: run, error: runError } = await scopeByTenant(
    supabaseAdmin.from(PAYROLL_TABLES.RUNS).select("*").eq("id", runId).maybeSingle(),
    { tenantDbId, role },
  );
  if (runError) throw new Error(runError.message);
  if (!run) throw new Error("Pay run not found");
  assertRunMutable(run.status);

  const { data: items, error: itemsError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("*, payroll_employees(*)")
    .eq("tenant_id", tenantDbId)
    .eq("run_id", runId);
  if (itemsError) throw new Error(itemsError.message);

  const settings = await getPayrollSettingsForTenant({ tenantDbId, role });
  const taxTablesBase = await loadPayrollTaxTables({ asOfDate: run.pay_date });
  const periods = payPeriodsPerYear(run.schedule_type || settings.defaultPaySchedule);
  const calculatedItems = [];
  const employeeIds = (items || []).map((item) => item.employee_id).filter(Boolean);
  const ytdMap = await fetchBatchEmployeeYtdBeforeRun({
    tenantDbId,
    role,
    employeeIds,
    periodEnd: run.period_end,
    excludeRunId: run.id,
  });

  for (const item of items || []) {
    const employeeRow = item.payroll_employees || null;
    if (!employeeRow) continue;

    const ytdBefore = ytdMap.get(item.employee_id) || normalizeYtdTotals({});

    const employee = applyEmployeeSettingsDefaults(
      serializePayrollEmployee(employeeRow),
      settings,
    );
    const resolvedHours = resolveRunItemHours({
      hoursRegular: item.hours_regular,
      hoursOvertime: item.hours_overtime,
      standardWeeklyHours: settings.standardWeeklyHours,
      scheduleType: run.schedule_type || settings.defaultPaySchedule,
    });
    const taxTables = taxTablesForEmployee(taxTablesBase, settings, employee);

    const result = calculatePayrollRunItem({
      employee,
      hoursRegular: resolvedHours.hoursRegular,
      hoursOvertime: resolvedHours.hoursOvertime,
      hourlyRateOverride: item.hourly_rate || employee.hourlyRate,
      taxTables,
      ytdBefore,
      payPeriodsPerYear: periods,
    });

    const updateRow = {
      hours_regular: resolvedHours.hoursRegular,
      hours_overtime: resolvedHours.hoursOvertime,
      gross_pay: result.grossPay,
      deductions: result.deductions,
      employer_taxes: result.employerTaxes,
      net_pay: result.netPay,
      stub_snapshot: {
        ...result.stubSnapshot,
        settingsApplied: {
          standardWeeklyHours: settings.standardWeeklyHours,
          defaultPaySchedule: settings.defaultPaySchedule,
          overtimeAutoSplit: resolvedHours.autoSplitApplied,
        },
      },
      ytd_snapshot: result.ytdAfter,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from(PAYROLL_TABLES.RUN_ITEMS)
      .update(updateRow)
      .eq("tenant_id", tenantDbId)
      .eq("id", item.id)
      .select("*, payroll_employees(*)")
      .single();

    if (updateError) throw new Error(updateError.message);
    calculatedItems.push(serializePayrollRunItem(updated, updated.payroll_employees));
  }

  const totals = summarizePayrollRunItems(calculatedItems);
  const now = new Date().toISOString();

  const { data: updatedRun, error: runUpdateError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .update({
      status: "calculated",
      totals,
      tax_table_version: taxTablesBase.versionLabel || "",
      updated_at: now,
    })
    .eq("id", runId)
    .eq("tenant_id", tenantDbId)
    .select("*")
    .single();

  if (runUpdateError) throw new Error(runUpdateError.message);

  return {
    run: serializePayrollRun(updatedRun),
    items: calculatedItems,
    totals,
    taxTableVersion: taxTablesBase.versionLabel || "",
  };
}

export async function approvePayrollRun({ tenantDbId, role, runId, userId }) {
  const { data: run, error } = await scopeByTenant(
    supabaseAdmin.from(PAYROLL_TABLES.RUNS).select("*").eq("id", runId).maybeSingle(),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  if (!run) throw new Error("Pay run not found");
  if (run.status !== "calculated") {
    throw new Error("Calculate the pay run before approval.");
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .update({
      status: "approved",
      approved_by: userId || null,
      approved_at: now,
      updated_at: now,
    })
    .eq("id", runId)
    .eq("tenant_id", tenantDbId)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);

  await refreshLaborTotalsForRun({ tenantDbId, runId }).catch((err) => {
    console.warn("[payroll-service] labor totals refresh on approve failed", err?.message);
  });

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "payroll_run",
    entityId: runId,
    action: "approve",
    beforeSnapshot: run,
    afterSnapshot: updated,
  }).catch(() => {});

  getCompanyDocumentBranding(tenantDbId)
    .then((branding) => {
      if (!branding.email) return null;
      return sendPayrollApprovalEmail({
        tenantId: tenantDbId,
        to: branding.email,
        runTitle: updated.title,
        payDate: updated.pay_date,
        totalNet: updated.totals?.netPay,
        action: "approved",
      });
    })
    .catch(() => {});

  return serializePayrollRun(updated);
}

export async function finalizePayrollRun({ tenantDbId, role, runId, userId }) {
  const { data: run, error } = await scopeByTenant(
    supabaseAdmin.from(PAYROLL_TABLES.RUNS).select("*").eq("id", runId).maybeSingle(),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  if (!run) throw new Error("Pay run not found");
  if (run.status !== "approved") {
    throw new Error("Approve the pay run before finalizing.");
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .update({
      status: "finalized",
      finalized_at: now,
      updated_at: now,
    })
    .eq("id", runId)
    .eq("tenant_id", tenantDbId)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);

  await refreshLaborTotalsForRun({ tenantDbId, runId }).catch((err) => {
    console.warn("[payroll-service] labor totals refresh failed", err?.message);
  });

  await createPayrollExpenseRecordsForRun({ tenantDbId, runId }).catch((err) => {
    console.warn("[payroll-service] expense records failed", err?.message);
  });

  await logPayrollAudit({
    tenantDbId,
    actorId: userId,
    entityType: "payroll_run",
    entityId: runId,
    action: "finalize",
    beforeSnapshot: run,
    afterSnapshot: updated,
  }).catch(() => {});

  getCompanyDocumentBranding(tenantDbId)
    .then((branding) => {
      if (!branding.email) return null;
      return sendPayrollApprovalEmail({
        tenantId: tenantDbId,
        to: branding.email,
        runTitle: updated.title,
        payDate: updated.pay_date,
        totalNet: updated.totals?.netPay,
        action: "finalized",
      });
    })
    .catch(() => {});

  return serializePayrollRun(updated);
}

export async function listEmployeePayrollHistory({
  tenantDbId,
  role,
  employeeId,
  limit = 50,
}) {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("*, payroll_runs(id, title, period_start, period_end, pay_date, status)")
    .eq("employee_id", employeeId)
    .eq("tenant_id", tenantDbId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    ...serializePayrollRunItem(row),
    run: row.payroll_runs
      ? {
          id: row.payroll_runs.id,
          title: row.payroll_runs.title,
          periodStart: row.payroll_runs.period_start,
          periodEnd: row.payroll_runs.period_end,
          payDate: row.payroll_runs.pay_date,
          status: row.payroll_runs.status,
        }
      : null,
  }));
}
