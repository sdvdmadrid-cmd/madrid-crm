import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { roundMoney } from "./payroll-money.js";
import {
  serializePayrollEmployee,
  serializePayrollRunItem,
} from "./payroll-serializer.js";
import { supabaseAdmin } from "./supabase-admin.js";

function emptyTotals() {
  return {
    grossPay: 0,
    netPay: 0,
    federalWithholding: 0,
    stateWithholding: 0,
    socialSecurity: 0,
    medicare: 0,
    employerTaxes: 0,
    employeeCount: 0,
    lineCount: 0,
  };
}

function accumulateTotals(target, item) {
  target.grossPay += Number(item.gross_pay || 0);
  target.netPay += Number(item.net_pay || 0);
  const d = item.deductions || {};
  target.federalWithholding += Number(d.federalWithholding || 0);
  target.stateWithholding += Number(d.stateWithholding || 0);
  target.socialSecurity += Number(d.socialSecurity || 0);
  target.medicare += Number(d.medicare || 0);
  const e = item.employer_taxes || {};
  target.employerTaxes += Number(e.total || 0);
  target.lineCount += 1;
}

function finalizeTotals(totals) {
  for (const key of Object.keys(totals)) {
    if (!["employeeCount", "lineCount"].includes(key)) {
      totals[key] = roundMoney(totals[key]);
    }
  }
  return totals;
}

function periodKey(dateStr, groupBy) {
  const d = String(dateStr || "").slice(0, 10);
  if (!d) return "unknown";
  if (groupBy === "weekly") {
    const date = new Date(`${d}T12:00:00Z`);
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + diff);
    return date.toISOString().slice(0, 10);
  }
  if (groupBy === "monthly") return d.slice(0, 7);
  if (groupBy === "quarterly") {
    const month = Number(d.slice(5, 7));
    const quarter = Math.ceil(month / 3);
    return `${d.slice(0, 4)}-Q${quarter}`;
  }
  if (groupBy === "yearly") return d.slice(0, 4);
  return d;
}

async function fetchReportItems({
  tenantDbId,
  startDate,
  endDate,
  employeeId,
  statuses = ["approved", "finalized"],
}) {
  let runsQuery = supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .select("id, title, period_start, period_end, pay_date, status, totals")
    .eq("tenant_id", tenantDbId)
    .in("status", statuses)
    .neq("status", "void")
    .gte("pay_date", startDate)
    .lte("pay_date", endDate);

  const { data: runs, error: runsError } = await runsQuery;
  if (runsError) throw new Error(runsError.message);
  if (!runs?.length) return { runs: [], items: [] };

  const runIds = runs.map((r) => r.id);
  let itemsQuery = supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("*, payroll_employees(*), payroll_runs(id, title, pay_date, period_start, period_end, status)")
    .eq("tenant_id", tenantDbId)
    .in("run_id", runIds);

  if (employeeId) {
    itemsQuery = itemsQuery.eq("employee_id", employeeId);
  }

  const { data: items, error: itemsError } = await itemsQuery;
  if (itemsError) throw new Error(itemsError.message);

  return { runs, items: items || [] };
}

export async function buildPayrollReport({
  tenantDbId,
  reportType = "date_range",
  startDate,
  endDate,
  employeeId,
  groupBy = "none",
}) {
  const year = new Date().getUTCFullYear();
  const defaultStart = `${year}-01-01`;
  const defaultEnd = new Date().toISOString().slice(0, 10);

  let rangeStart = startDate || defaultStart;
  let rangeEnd = endDate || defaultEnd;

  if (reportType === "weekly") groupBy = "weekly";
  if (reportType === "monthly") groupBy = "monthly";
  if (reportType === "quarterly") groupBy = "quarterly";
  if (reportType === "ytd") {
    rangeStart = `${year}-01-01`;
    rangeEnd = defaultEnd;
    groupBy = groupBy === "none" ? "monthly" : groupBy;
  }

  const { runs, items } = await fetchReportItems({
    tenantDbId,
    startDate: rangeStart,
    endDate: rangeEnd,
    employeeId,
  });

  const totals = emptyTotals();
  const employeeMap = new Map();
  const periodMap = new Map();
  const employeeIds = new Set();

  for (const row of items) {
    accumulateTotals(totals, row);
    employeeIds.add(row.employee_id);

    const empKey = row.employee_id;
    if (!employeeMap.has(empKey)) {
      employeeMap.set(empKey, {
        employee: row.payroll_employees
          ? serializePayrollEmployee(row.payroll_employees)
          : null,
        totals: emptyTotals(),
      });
    }
    accumulateTotals(employeeMap.get(empKey).totals, row);

    if (groupBy !== "none") {
      const payDate = row.payroll_runs?.pay_date || row.created_at;
      const key = periodKey(payDate, groupBy);
      if (!periodMap.has(key)) periodMap.set(key, emptyTotals());
      accumulateTotals(periodMap.get(key), row);
    }
  }

  totals.employeeCount = employeeIds.size;
  finalizeTotals(totals);

  const byEmployee = [...employeeMap.entries()].map(([id, payload]) => ({
    employeeId: id,
    employee: payload.employee,
    totals: finalizeTotals(payload.totals),
  }));

  const byPeriod = [...periodMap.entries()]
    .map(([period, periodTotals]) => ({
      period,
      totals: finalizeTotals({ ...periodTotals }),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const lines = items.map((row) =>
    serializePayrollRunItem(row, row.payroll_employees),
  );

  return {
    reportType,
    startDate: rangeStart,
    endDate: rangeEnd,
    groupBy,
    runCount: runs.length,
    totals,
    byEmployee,
    byPeriod,
    lines,
    employerTaxSummary: {
      employerTaxes: totals.employerTaxes,
      federalWithholding: totals.federalWithholding,
      stateWithholding: totals.stateWithholding,
      socialSecurity: totals.socialSecurity,
      medicare: totals.medicare,
    },
  };
}
