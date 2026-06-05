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

async function countJobsByStatus(tenantDbId, statusPatterns) {
  const { count, error } = await supabaseAdmin
    .from("jobs")
    .select("id", { head: true, count: "exact" })
    .eq("tenant_id", tenantDbId)
    .in("status", statusPatterns);
  if (error) throw new Error(error.message);
  return Number(count || 0);
}

async function getJobPipelineCounts(tenantDbId) {
  const [totalRes, active, pending, completed] = await Promise.all([
    supabaseAdmin
      .from("jobs")
      .select("id", { head: true, count: "exact" })
      .eq("tenant_id", tenantDbId),
    countJobsByStatus(tenantDbId, ["Active", "In Progress"]),
    countJobsByStatus(tenantDbId, ["Pending", "Draft"]),
    countJobsByStatus(tenantDbId, ["Completed", "Done"]),
  ]);

  if (totalRes.error) throw new Error(totalRes.error.message);

  return {
    total: Number(totalRes.count || 0),
    active,
    pending,
    completed,
  };
}

export async function getExecutiveDashboardMetrics(tenantDbId) {
  const { startDate, endDate, monthLabel, monthStartIso } = monthBounds();

  const [
    paidInvoicesRes,
    openInvoicesRes,
    payrollSummary,
    expenseSumRes,
    jobPipeline,
    projectSummaries,
  ] = await Promise.all([
    supabaseAdmin
      .from("invoices")
      .select(
        "id, amount, status, balance_due, paid_amount, created_at, updated_at, stripe_last_payment_at",
      )
      .eq("tenant_id", tenantDbId)
      .gte("stripe_last_payment_at", monthStartIso)
      .limit(500),
    supabaseAdmin
      .from("invoices")
      .select("id, amount, status, balance_due, created_at, updated_at, stripe_last_payment_at")
      .eq("tenant_id", tenantDbId)
      .gt("balance_due", 0)
      .limit(500),
    getPayrollPlSummary({ tenantDbId, startDate, endDate }),
    supabaseAdmin
      .from(JOB_EXPENSE_TABLE)
      .select("amount")
      .eq("tenant_id", tenantDbId)
      .gte("expense_date", startDate)
      .lte("expense_date", endDate),
    getJobPipelineCounts(tenantDbId),
    listJobProfitRollups(tenantDbId, { limit: 40 }),
  ]);

  if (paidInvoicesRes.error) throw new Error(paidInvoicesRes.error.message);
  if (openInvoicesRes.error) throw new Error(openInvoicesRes.error.message);
  if (expenseSumRes.error) throw new Error(expenseSumRes.error.message);

  const paidMonthRes = await supabaseAdmin
    .from("invoices")
    .select("id, amount, status, balance_due, created_at, updated_at, stripe_last_payment_at")
    .eq("tenant_id", tenantDbId)
    .ilike("status", "paid")
    .gte("updated_at", monthStartIso)
    .limit(500);

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
    jobPipeline,
    losingJobs: losingJobs.slice(0, 10),
    topProfitableJobs: topProfitable,
    projectSummaries: projectSummaries.slice(0, 15),
  };
}
