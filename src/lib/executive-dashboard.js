import "server-only";

import { roundMoney } from "./payroll-money.js";
import { getPayrollPlSummary } from "./payroll-accounting.js";
import { listJobProfitRollups } from "./project-pl.js";
import { invoiceAmount, invoicePaidDate, isInvoicePaid } from "./project-pl-utils.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { JOB_EXPENSE_TABLE } from "./job-expense-constants.js";

function monthBounds(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return {
    startDate: `${y}-${m}-01`,
    endDate: date.toISOString().slice(0, 10),
    monthLabel: `${y}-${m}`,
    monthStartIso: `${y}-${m}-01T00:00:00.000Z`,
  };
}

function summarizeInvoicesForMonth(invoices, startDate, endDate) {
  let revenueThisMonth = 0;
  let outstandingInvoices = 0;
  let accountsReceivable = 0;

  for (const inv of invoices) {
    const total = invoiceAmount(inv);
    const created = String(inv.created_at || "").slice(0, 10);
    const paidAt = invoicePaidDate(inv);
    const status = String(inv.status || "").toLowerCase();

    if (paidAt && paidAt >= startDate && paidAt <= endDate) {
      revenueThisMonth += total;
    } else if (status === "paid" && created >= startDate && created <= endDate) {
      revenueThisMonth += total;
    }

    if (!isInvoicePaid(inv)) {
      outstandingInvoices += 1;
      accountsReceivable += Number(inv.balance_due ?? total);
    }
  }

  return {
    revenueThisMonth: roundMoney(revenueThisMonth),
    outstandingInvoices,
    accountsReceivable: roundMoney(accountsReceivable),
  };
}

export async function getExecutiveDashboardMetrics(tenantDbId) {
  const { startDate, endDate, monthLabel, monthStartIso } = monthBounds();

  const [
    paidInvoicesRes,
    openInvoicesRes,
    payrollSummary,
    expenseSumRes,
    jobsRes,
    projectSummaries,
  ] = await Promise.all([
    supabaseAdmin
      .from("invoices")
      .select(
        "id, amount, status, balance_due, paid_amount, created_at, updated_at, stripe_last_payment_at",
      )
      .eq("tenant_id", tenantDbId)
      .gte("stripe_last_payment_at", monthStartIso),
    supabaseAdmin
      .from("invoices")
      .select("id, amount, status, balance_due, created_at, updated_at, stripe_last_payment_at")
      .eq("tenant_id", tenantDbId)
      .gt("balance_due", 0),
    getPayrollPlSummary({ tenantDbId, startDate, endDate }),
    supabaseAdmin
      .from(JOB_EXPENSE_TABLE)
      .select("amount")
      .eq("tenant_id", tenantDbId)
      .gte("expense_date", startDate)
      .lte("expense_date", endDate),
    supabaseAdmin
      .from("jobs")
      .select("id, status, title")
      .eq("tenant_id", tenantDbId),
    listJobProfitRollups(tenantDbId, { limit: 40 }),
  ]);

  if (paidInvoicesRes.error) throw new Error(paidInvoicesRes.error.message);
  if (openInvoicesRes.error) throw new Error(openInvoicesRes.error.message);
  if (expenseSumRes.error) throw new Error(expenseSumRes.error.message);
  if (jobsRes.error) throw new Error(jobsRes.error.message);

  const paidMonthRes = await supabaseAdmin
    .from("invoices")
    .select("id, amount, status, balance_due, created_at, updated_at, stripe_last_payment_at")
    .eq("tenant_id", tenantDbId)
    .ilike("status", "paid")
    .gte("updated_at", monthStartIso);

  const byId = new Map();
  for (const inv of [
    ...(paidInvoicesRes.data || []),
    ...(paidMonthRes.data || []),
    ...(openInvoicesRes.data || []),
  ]) {
    if (inv?.id) byId.set(inv.id, inv);
  }
  const uniqueInvoices = [...byId.values()];

  const invoiceMetrics = summarizeInvoicesForMonth(uniqueInvoices, startDate, endDate);

  const expensesThisMonth = (expenseSumRes.data || []).reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0,
  );

  const payrollThisMonth = payrollSummary.laborBurden || payrollSummary.grossLabor || 0;
  const totalCostsThisMonth = roundMoney(payrollThisMonth + expensesThisMonth);
  const grossProfit = roundMoney(
    invoiceMetrics.revenueThisMonth - totalCostsThisMonth,
  );
  const grossMargin =
    invoiceMetrics.revenueThisMonth > 0
      ? roundMoney((grossProfit / invoiceMetrics.revenueThisMonth) * 100)
      : 0;

  const jobs = jobsRes.data || [];
  const pipeline = {
    total: jobs.length,
    active: jobs.filter((j) => /progress|active|in progress/i.test(j.status || "")).length,
    pending: jobs.filter((j) => /pending/i.test(j.status || "")).length,
    completed: jobs.filter((j) => /complete|done/i.test(j.status || "")).length,
  };

  const losingJobs = projectSummaries.filter((p) => p.isLosingMoney);
  const topProfitable = [...projectSummaries]
    .sort((a, b) => b.grossProfit - a.grossProfit)
    .slice(0, 5);

  return {
    monthLabel,
    revenueThisMonth: invoiceMetrics.revenueThisMonth,
    payrollThisMonth: roundMoney(payrollThisMonth),
    expensesThisMonth: roundMoney(expensesThisMonth),
    totalCostsThisMonth,
    grossProfit,
    grossMargin,
    netProfit: grossProfit,
    outstandingInvoices: invoiceMetrics.outstandingInvoices,
    accountsReceivable: invoiceMetrics.accountsReceivable,
    jobPipeline: pipeline,
    losingJobs: losingJobs.slice(0, 10),
    topProfitableJobs: topProfitable,
    projectSummaries: projectSummaries.slice(0, 15),
  };
}
