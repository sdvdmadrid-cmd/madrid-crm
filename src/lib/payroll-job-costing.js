import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { roundMoney } from "./payroll-money.js";
import { supabaseAdmin } from "./supabase-admin.js";

export {
  buildAchExportForRun,
  buildAchFileContent,
  createAchBatchDraft,
  submitAchBatchForReview,
  approveAchBatch,
  rejectAchBatch,
  exportAchBatch,
  markAchBatchTransmitted,
  listAchBatchesForRun,
} from "./payroll-ach-service.js";

export async function getJobLaborSummary(tenantDbId, jobId) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, title, labor_cost_total, labor_hours_total")
    .eq("tenant_id", tenantDbId)
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error("Job not found");

  const { data: items, error: itemsError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("*, payroll_employees(first_name, last_name), payroll_runs(pay_date, status)")
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (itemsError) throw new Error(itemsError.message);

  return {
    jobId: job.id,
    jobTitle: job.title || "",
    laborCostTotal: Number(job.labor_cost_total || 0),
    laborHoursTotal: Number(job.labor_hours_total || 0),
    entries: (items || []).map((row) => ({
      id: row.id,
      employeeName: [row.payroll_employees?.first_name, row.payroll_employees?.last_name]
        .filter(Boolean)
        .join(" "),
      hoursRegular: Number(row.hours_regular || 0),
      hoursOvertime: Number(row.hours_overtime || 0),
      grossPay: Number(row.gross_pay || 0),
      payDate: row.payroll_runs?.pay_date || null,
      runStatus: row.payroll_runs?.status || null,
    })),
  };
}

export async function refreshJobLaborTotals(tenantDbId, jobId) {
  if (!jobId) return;

  const { data: items, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("gross_pay, hours_regular, hours_overtime, employer_taxes, payroll_runs(status)")
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  let laborCost = 0;
  let laborHours = 0;
  let laborBurden = 0;

  for (const item of items || []) {
    if (!["approved", "finalized"].includes(item.payroll_runs?.status)) continue;
    laborCost += Number(item.gross_pay || 0);
    laborHours += Number(item.hours_regular || 0) + Number(item.hours_overtime || 0);
    laborBurden += Number(item.gross_pay || 0) + Number(item.employer_taxes?.total || 0);
  }

  await supabaseAdmin
    .from("jobs")
    .update({
      labor_cost_total: roundMoney(laborCost),
      labor_hours_total: roundMoney(laborHours),
      labor_burden_total: roundMoney(laborBurden),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantDbId)
    .eq("id", jobId);
}

export async function refreshLaborTotalsForRun({ tenantDbId, runId }) {
  const { data: items, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("job_id")
    .eq("tenant_id", tenantDbId)
    .eq("run_id", runId)
    .not("job_id", "is", null);

  if (error) throw new Error(error.message);

  const jobIds = [...new Set((items || []).map((row) => row.job_id).filter(Boolean))];
  await Promise.all(jobIds.map((jobId) => refreshJobLaborTotals(tenantDbId, jobId)));
}
