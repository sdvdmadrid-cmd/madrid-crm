import "server-only";

import { buildPayrollReport } from "./payroll-reports.js";
import { calculatePayrollRunItem } from "./payroll-calculator.js";
import { defaultFederalTables } from "./payroll-tax-tables.js";
import { calculatePayrollRun } from "./payroll-service.js";
import { upcomingPayPeriods, computePayPeriod } from "./payroll-calendar.js";
import { getJobProjectPl, listProjectPlSummaries, listLosingJobs } from "./project-pl.js";
import { getExecutiveDashboardMetrics } from "./executive-dashboard.js";
import { createInvoiceFromJob } from "./job-invoice-service.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { PAYROLL_TABLES } from "./payroll-constants.js";
import { serializePayrollEmployee } from "./payroll-serializer.js";

export async function aiSearchPayrollEmployees(tenantDbId, query = "") {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.EMPLOYEES)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("status", "active")
    .order("last_name")
    .limit(100);

  if (error) throw new Error(error.message);

  const q = String(query || "").toLowerCase();
  return (data || [])
    .map(serializePayrollEmployee)
    .filter((row) => {
      if (!q) return true;
      return (
        row.fullName?.toLowerCase().includes(q) ||
        row.email?.toLowerCase().includes(q)
      );
    })
    .slice(0, 10);
}

export async function aiCalculateEmployeePaycheck({
  tenantDbId,
  employeeName,
  hoursRegular = 0,
  hourlyRate,
}) {
  const employees = await aiSearchPayrollEmployees(tenantDbId, employeeName);
  const employee = employees[0];
  if (!employee) return { ok: false, error: `Employee not found: ${employeeName}` };

  const taxTables = defaultFederalTables();
  const result = calculatePayrollRunItem({
    employee,
    hoursRegular: Number(hoursRegular || 0),
    hourlyRateOverride: hourlyRate ?? employee.hourlyRate,
    taxTables,
    payPeriodsPerYear: 26,
  });

  return {
    ok: true,
    employee: employee.fullName,
    hoursRegular: Number(hoursRegular || 0),
    hourlyRate: hourlyRate ?? employee.hourlyRate,
    grossPay: result.grossPay,
    netPay: result.netPay,
    deductions: result.deductions,
    employerTaxes: result.employerTaxes,
  };
}

export async function aiGetPayrollReport(tenantDbId, { reportType = "ytd", startDate, endDate, employeeName }) {
  let employeeId;
  if (employeeName) {
    const matches = await aiSearchPayrollEmployees(tenantDbId, employeeName);
    employeeId = matches[0]?.id;
  }

  const report = await buildPayrollReport({
    tenantDbId,
    reportType,
    startDate,
    endDate,
    employeeId,
  });

  return { ok: true, report };
}

export async function aiFindMissingHours(tenantDbId, periodStart, periodEnd) {
  const { data: employees } = await supabaseAdmin
    .from(PAYROLL_TABLES.EMPLOYEES)
    .select("id, first_name, last_name, hourly_rate, pay_type")
    .eq("tenant_id", tenantDbId)
    .eq("status", "active")
    .eq("pay_type", "hourly");

  const { data: timeEntries } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .select("employee_id, hours")
    .eq("tenant_id", tenantDbId)
    .gte("created_at", `${periodStart}T00:00:00Z`)
    .lte("created_at", `${periodEnd}T23:59:59Z`);

  const hoursByEmployee = new Map();
  for (const entry of timeEntries || []) {
    hoursByEmployee.set(
      entry.employee_id,
      (hoursByEmployee.get(entry.employee_id) || 0) + Number(entry.hours || 0),
    );
  }

  const missing = [];
  for (const emp of employees || []) {
    const hours = hoursByEmployee.get(emp.id) || 0;
    if (hours <= 0) {
      missing.push({
        employeeId: emp.id,
        name: `${emp.first_name} ${emp.last_name}`.trim(),
        hours,
      });
    }
  }

  return { ok: true, missing, periodStart, periodEnd };
}

export async function aiRunPayrollForWeek(tenantDbId, role, userId, scheduleType = "weekly") {
  const period = computePayPeriod({ scheduleType, anchorDate: new Date() });

  const { data: run, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .insert({
      tenant_id: tenantDbId,
      user_id: userId || null,
      schedule_type: scheduleType,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      pay_date: period.payDate,
      status: "draft",
      title: `AI Pay Run ${period.periodStart}`,
      created_by: userId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const { data: employees } = await supabaseAdmin
    .from(PAYROLL_TABLES.EMPLOYEES)
    .select("id, hourly_rate")
    .eq("tenant_id", tenantDbId)
    .eq("status", "active");

  const { data: timeEntries } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .select("employee_id, hours, hourly_rate, entry_type")
    .eq("tenant_id", tenantDbId)
    .in("status", ["submitted", "approved"])
    .gte("created_at", `${period.periodStart}T00:00:00Z`);

  const hoursMap = new Map();
  for (const entry of timeEntries || []) {
    const key = entry.employee_id;
    const prev = hoursMap.get(key) || { regular: 0, overtime: 0, rate: entry.hourly_rate };
    if (entry.entry_type === "overtime") prev.overtime += Number(entry.hours || 0);
    else prev.regular += Number(entry.hours || 0);
    hoursMap.set(key, prev);
  }

  const now = new Date().toISOString();
  for (const emp of employees || []) {
    const h = hoursMap.get(emp.id) || { regular: 0, overtime: 0, rate: emp.hourly_rate };
    if (h.regular <= 0 && h.overtime <= 0) continue;
    await supabaseAdmin.from(PAYROLL_TABLES.RUN_ITEMS).insert({
      tenant_id: tenantDbId,
      run_id: run.id,
      employee_id: emp.id,
      hours_regular: h.regular,
      hours_overtime: h.overtime,
      hourly_rate: h.rate || emp.hourly_rate,
      created_at: now,
      updated_at: now,
    });
  }

  const calculated = await calculatePayrollRun({ tenantDbId, role, runId: run.id });

  return {
    ok: true,
    runId: run.id,
    period,
    totals: calculated.totals,
    itemCount: calculated.items?.length || 0,
  };
}

export async function aiGetJobPayrollCost(tenantDbId, jobSearch = "") {
  const summaries = await listProjectPlSummaries(tenantDbId, {
    search: jobSearch,
    limit: 5,
  });
  if (!summaries.length) {
    return { ok: false, error: `No job found matching "${jobSearch}"` };
  }
  const match = summaries[0];
  const pl = await getJobProjectPl(tenantDbId, match.jobId);
  return {
    ok: true,
    jobTitle: pl.jobTitle,
    revenue: pl.revenue,
    laborBurden: pl.actual.laborBurden,
    grossLabor: pl.actual.grossLabor,
    employerTaxes: pl.actual.employerTaxes,
    estimatedLabor: pl.estimate.estimatedLaborCost,
    variance: pl.variance.laborCost,
    grossProfit: pl.profit.grossProfit,
    marginPercent: pl.profit.marginPercent,
    profitAfterLabor: pl.profit.profitAfterLabor,
  };
}

export async function aiGetLaborCostByProject(tenantDbId) {
  const projects = await listProjectPlSummaries(tenantDbId, { limit: 30 });
  return { ok: true, projects };
}

export async function aiGetProjectProfitSummary(tenantDbId, jobSearch = "") {
  return aiGetJobPayrollCost(tenantDbId, jobSearch);
}

export async function aiGetMaterialCostByProject(tenantDbId) {
  const projects = await listProjectPlSummaries(tenantDbId, { limit: 30 });
  return {
    ok: true,
    projects: projects.map((p) => ({
      jobTitle: p.jobTitle,
      materialsCost: p.materialsCost,
      totalCost: p.totalCost,
      revenue: p.revenue,
    })),
  };
}

export async function aiListLosingJobs(tenantDbId) {
  const losing = await listLosingJobs(tenantDbId);
  return { ok: true, jobs: losing };
}

export async function aiCreateInvoiceForJob(tenantDbId, userId, jobSearch, billingType = "full") {
  const matches = await listProjectPlSummaries(tenantDbId, { search: jobSearch, limit: 1 });
  if (!matches.length) return { ok: false, error: `No job found: ${jobSearch}` };
  const result = await createInvoiceFromJob({
    tenantDbId,
    userId,
    jobId: matches[0].jobId,
    billingType,
  });
  return { ok: true, ...result };
}

export async function aiGetMonthlyProfitReport(tenantDbId) {
  const metrics = await getExecutiveDashboardMetrics(tenantDbId);
  return {
    ok: true,
    month: metrics.monthLabel,
    revenue: metrics.revenueThisMonth,
    costs: metrics.totalCostsThisMonth,
    grossProfit: metrics.grossProfit,
    grossMargin: metrics.grossMargin,
    topJobs: metrics.topProfitableJobs,
  };
}

export async function aiGetOutstandingInvoices(tenantDbId) {
  const metrics = await getExecutiveDashboardMetrics(tenantDbId);
  return {
    ok: true,
    count: metrics.outstandingInvoices,
    accountsReceivable: metrics.accountsReceivable,
  };
}

export async function aiGetPayrollCostsThisMonth(tenantDbId) {
  const metrics = await getExecutiveDashboardMetrics(tenantDbId);
  return {
    ok: true,
    month: metrics.monthLabel,
    payrollCost: metrics.payrollThisMonth,
    expenses: metrics.expensesThisMonth,
  };
}

export { upcomingPayPeriods, computePayPeriod };
