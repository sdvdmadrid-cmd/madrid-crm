import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { roundMoney } from "./payroll-money.js";
import {
  listEquipmentAssignments,
  listJobExpenses,
  summarizeExpensesByCategory,
} from "./job-expense-service.js";
import { sumJobAssignedBills } from "./bills-expenses-service.js";
import {
  buildCostComparison,
  computeProjectProfit,
  extractJobEstimateBreakdown,
  invoiceAmount,
  invoicePaidDate,
  isInvoicePaid,
  summarizeInvoices,
} from "./project-pl-utils.js";
import { supabaseAdmin } from "./supabase-admin.js";

export {
  extractJobEstimateBreakdown,
  summarizeInvoices,
  computeProjectProfit,
  buildCostComparison,
} from "./project-pl-utils.js";

async function fetchJobInvoices(tenantDbId, jobId) {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select(
      "id, amount, status, balance_due, paid_amount, created_at, updated_at, stripe_last_payment_at",
    )
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);
  return (data || []).map((inv) => ({
    ...inv,
    total: invoiceAmount(inv),
  }));
}

async function fetchJobPayrollExpenses(tenantDbId, jobId) {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.EXPENSE_RECORDS)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchJobPayrollRunItems(tenantDbId, jobId) {
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select(
      "id, gross_pay, hours_regular, hours_overtime, employer_taxes, net_pay, payroll_runs(status, pay_date, title)",
    )
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);
  return (data || []).filter((row) =>
    ["approved", "finalized"].includes(row.payroll_runs?.status),
  );
}

function summarizePayrollFromRunItems(items = []) {
  let grossLabor = 0;
  let employerTaxes = 0;
  let laborHours = 0;

  for (const item of items) {
    grossLabor += Number(item.gross_pay || 0);
    employerTaxes += Number(item.employer_taxes?.total || 0);
    laborHours +=
      Number(item.hours_regular || 0) + Number(item.hours_overtime || 0);
  }

  return {
    grossLabor: roundMoney(grossLabor),
    employerTaxes: roundMoney(employerTaxes),
    laborBurden: roundMoney(grossLabor + employerTaxes),
    laborHours: roundMoney(laborHours),
    entryCount: items.length,
  };
}

function summarizePayrollFromExpenseRecords(records = []) {
  let grossLabor = 0;
  let employerTaxes = 0;
  let laborBurden = 0;

  for (const row of records) {
    grossLabor += Number(row.gross_amount || 0);
    employerTaxes += Number(row.employer_tax_amount || 0);
    laborBurden += Number(row.labor_burden || 0);
  }

  return {
    grossLabor: roundMoney(grossLabor),
    employerTaxes: roundMoney(employerTaxes),
    laborBurden: roundMoney(laborBurden),
    entryCount: records.length,
  };
}

function splitActualCosts(expenseSummary, equipmentAssignments = []) {
  const by = expenseSummary.byCategory;
  const equipmentFromAssignments = equipmentAssignments.reduce(
    (sum, row) => sum + Number(row.costAmount || 0),
    0,
  );

  const materialsCost = roundMoney(by.material + by.vendor);
  const equipmentCost = roundMoney(by.equipment + equipmentFromAssignments);
  const subcontractorCost = roundMoney(by.subcontractor);
  const otherCost = roundMoney(by.dump_fee + by.fuel + by.other);

  return {
    materialsCost,
    equipmentCost,
    subcontractorCost,
    otherCost,
    expenseTotal: expenseSummary.total,
  };
}

export async function getJobProjectPl(tenantDbId, jobId) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, client_name, service, status, price, estimate_snapshot, labor_cost_total, labor_hours_total, labor_burden_total, material_cost_total, equipment_cost_total, subcontractor_cost_total, other_cost_total, total_job_cost",
    )
    .eq("tenant_id", tenantDbId)
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error("Job not found");

  const [invoices, expenseRecords, runItems, jobExpenses, equipmentAssignments, billsAssignedTotal] =
    await Promise.all([
      fetchJobInvoices(tenantDbId, jobId),
      fetchJobPayrollExpenses(tenantDbId, jobId),
      fetchJobPayrollRunItems(tenantDbId, jobId),
      listJobExpenses(tenantDbId, jobId),
      listEquipmentAssignments(tenantDbId, jobId),
      sumJobAssignedBills(tenantDbId, jobId),
    ]);

  const estimate = extractJobEstimateBreakdown(job);
  const invoiceSummary = summarizeInvoices(invoices);

  const payrollFromItems = summarizePayrollFromRunItems(runItems);
  const payrollFromRecords = summarizePayrollFromExpenseRecords(expenseRecords);

  const actualGrossLabor =
    payrollFromRecords.entryCount > 0
      ? payrollFromRecords.grossLabor
      : payrollFromItems.grossLabor;
  const actualEmployerTaxes =
    payrollFromRecords.entryCount > 0
      ? payrollFromRecords.employerTaxes
      : payrollFromItems.employerTaxes;
  const actualLaborBurden =
    Number(job.labor_burden_total || 0) ||
    (payrollFromRecords.entryCount > 0
      ? payrollFromRecords.laborBurden
      : payrollFromItems.laborBurden);
  const actualLaborHours =
    Number(job.labor_hours_total || 0) || payrollFromItems.laborHours;

  const expenseSummary = summarizeExpensesByCategory(
    jobExpenses.map((e) => ({ category: e.category, amount: e.amount })),
  );
  const actualCosts = splitActualCosts(expenseSummary, equipmentAssignments);
  actualCosts.otherCost = roundMoney(actualCosts.otherCost + billsAssignedTotal);
  actualCosts.billsAssignedTotal = billsAssignedTotal;

  const revenue =
    invoiceSummary.paidTotal > 0
      ? invoiceSummary.paidTotal
      : invoiceSummary.invoicedTotal > 0
        ? invoiceSummary.invoicedTotal
        : estimate.estimatedRevenue;

  const profitMetrics = computeProjectProfit({
    revenue,
    laborBurden: actualLaborBurden,
    materialsCost: actualCosts.materialsCost,
    equipmentCost: actualCosts.equipmentCost,
    subcontractorCost: actualCosts.subcontractorCost,
    otherCosts: actualCosts.otherCost,
  });

  const comparison = buildCostComparison(
    {
      laborCost: estimate.estimatedLaborCost,
      materialsCost: estimate.estimatedMaterialsCost,
      equipmentCost: 0,
      subcontractorCost: 0,
      otherCost: 0,
    },
    {
      laborBurden: actualLaborBurden,
      materialsCost: actualCosts.materialsCost,
      equipmentCost: actualCosts.equipmentCost,
      subcontractorCost: actualCosts.subcontractorCost,
      otherCost: actualCosts.otherCost,
    },
  );

  const laborUtilization =
    estimate.estimatedHours > 0
      ? roundMoney((actualLaborHours / estimate.estimatedHours) * 100)
      : 0;

  return {
    jobId: job.id,
    jobTitle: job.title || "",
    clientName: job.client_name || "",
    service: job.service || "",
    status: job.status || "",
    revenue: roundMoney(revenue),
    revenueSource:
      invoiceSummary.paidTotal > 0
        ? "paid_invoices"
        : invoiceSummary.invoicedTotal > 0
          ? "invoiced"
          : "estimate",
    invoices: invoiceSummary,
    estimate: {
      ...estimate,
      totalEstimatedCost: roundMoney(
        estimate.estimatedLaborCost + estimate.estimatedMaterialsCost,
      ),
    },
    actual: {
      grossLabor: actualGrossLabor,
      employerTaxes: actualEmployerTaxes,
      laborBurden: actualLaborBurden,
      laborHours: actualLaborHours,
      materialsCost: actualCosts.materialsCost,
      equipmentCost: actualCosts.equipmentCost,
      subcontractorCost: actualCosts.subcontractorCost,
      otherCost: actualCosts.otherCost,
      billsAssignedTotal: actualCosts.billsAssignedTotal,
      totalCost: profitMetrics.totalCosts,
      totalJobCost: roundMoney(Number(job.total_job_cost || 0) || profitMetrics.totalCosts),
    },
    costBreakdown: expenseSummary.byCategory,
    comparison,
    variance: {
      laborCost: roundMoney(actualLaborBurden - estimate.estimatedLaborCost),
      laborHours: roundMoney(actualLaborHours - estimate.estimatedHours),
      totalCost: roundMoney(
        profitMetrics.totalCosts -
          (estimate.estimatedLaborCost + estimate.estimatedMaterialsCost),
      ),
    },
    profit: {
      grossProfit: profitMetrics.grossProfit,
      marginPercent: profitMetrics.marginPercent,
      netProfit: profitMetrics.netProfit,
      profitAfterLabor: profitMetrics.profitAfterLabor,
    },
    metrics: {
      laborUtilization,
      isLosingMoney: profitMetrics.grossProfit < 0,
    },
    expenses: jobExpenses.slice(0, 50),
    equipmentAssignments,
    payrollEntries: runItems.slice(0, 25).map((row) => ({
      id: row.id,
      grossPay: Number(row.gross_pay || 0),
      employerTaxes: Number(row.employer_taxes?.total || 0),
      hours:
        Number(row.hours_regular || 0) + Number(row.hours_overtime || 0),
      payDate: row.payroll_runs?.pay_date || null,
      runTitle: row.payroll_runs?.title || "",
    })),
  };
}

function mapJobToProfitRollup(job) {
  const revenue = roundMoney(
    Number(String(job.price || "").replace(/[^0-9.-]/g, "")) || 0,
  );
  const totalCost = roundMoney(Number(job.total_job_cost || 0));
  const grossProfit = roundMoney(revenue - totalCost);
  const marginPercent =
    revenue > 0 ? roundMoney((grossProfit / revenue) * 100) : 0;

  return {
    jobId: job.id,
    jobTitle: job.title || "",
    clientName: job.client_name || "",
    revenue,
    totalCost,
    actualLaborBurden: roundMoney(Number(job.labor_burden_total || 0)),
    materialsCost: roundMoney(Number(job.material_cost_total || 0)),
    equipmentCost: roundMoney(Number(job.equipment_cost_total || 0)),
    subcontractorCost: roundMoney(Number(job.subcontractor_cost_total || 0)),
    otherCost: roundMoney(Number(job.other_cost_total || 0)),
    grossProfit,
    marginPercent,
    isLosingMoney: grossProfit < 0,
  };
}

export async function getJobProfitRollup(tenantDbId, jobId) {
  const { data: job, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, client_name, status, price, total_job_cost, labor_burden_total, material_cost_total, equipment_cost_total, subcontractor_cost_total, other_cost_total",
    )
    .eq("tenant_id", tenantDbId)
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!job) return null;
  return mapJobToProfitRollup(job);
}

export async function listJobProfitRollups(tenantDbId, { search = "", limit = 50 } = {}) {
  const cap = Math.min(limit, 100);
  const { data: jobs, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, client_name, status, price, total_job_cost, labor_burden_total, material_cost_total, equipment_cost_total, subcontractor_cost_total, other_cost_total",
    )
    .eq("tenant_id", tenantDbId)
    .order("updated_at", { ascending: false })
    .limit(cap);

  if (error) throw new Error(error.message);

  const q = String(search || "").toLowerCase();
  const filtered = (jobs || []).filter((job) => {
    if (!q) return true;
    return (
      String(job.title || "").toLowerCase().includes(q) ||
      String(job.client_name || "").toLowerCase().includes(q)
    );
  });

  return filtered.map((job) => mapJobToProfitRollup(job));
}

export async function listProjectPlSummaries(tenantDbId, { search = "", limit = 50 } = {}) {
  const rollups = await listJobProfitRollups(tenantDbId, { search, limit });
  return rollups.map((row) => ({
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    clientName: row.clientName,
    revenue: row.revenue,
    totalCost: row.totalCost,
    actualLaborBurden: row.actualLaborBurden,
    materialsCost: row.materialsCost,
    equipmentCost: row.equipmentCost,
    subcontractorCost: row.subcontractorCost,
    grossProfit: row.grossProfit,
    marginPercent: row.marginPercent,
    isLosingMoney: row.isLosingMoney,
  }));
}

export async function listLosingJobs(tenantDbId, limit = 20) {
  const summaries = await listJobProfitRollups(tenantDbId, { limit: 100 });
  return summaries.filter((row) => row.isLosingMoney).slice(0, limit);
}
