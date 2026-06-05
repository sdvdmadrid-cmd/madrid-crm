import "server-only";

import {
  EQUIPMENT_ASSIGNMENTS_TABLE,
  EQUIPMENT_TABLE,
  JOB_EXPENSE_CATEGORIES,
  JOB_EXPENSE_TABLE,
} from "./job-expense-constants.js";
import {
  extractAmountFromReceiptText,
  summarizeExpensesByCategory,
} from "./job-expense-utils.js";
import { roundMoney } from "./payroll-money.js";
import { supabaseAdmin } from "./supabase-admin.js";

export { extractAmountFromReceiptText, summarizeExpensesByCategory } from "./job-expense-utils.js";

export function serializeJobExpense(row = {}) {
  return {
    id: row.id,
    jobId: row.job_id,
    category: row.category || "other",
    vendorName: row.vendor_name || "",
    description: row.description || "",
    amount: Number(row.amount || 0),
    expenseDate: row.expense_date || null,
    receiptFileId: row.receipt_file_id || null,
    ocrData: row.ocr_data || {},
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function listJobExpenses(tenantDbId, jobId) {
  const { data, error } = await supabaseAdmin
    .from(JOB_EXPENSE_TABLE)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId)
    .order("expense_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(serializeJobExpense);
}

export async function createJobExpense(tenantDbId, userId, jobId, body = {}) {
  const category = JOB_EXPENSE_CATEGORIES.includes(body.category)
    ? body.category
    : "other";
  const now = new Date().toISOString();

  const row = {
    tenant_id: tenantDbId,
    job_id: jobId,
    category,
    vendor_name: String(body.vendorName || "").trim(),
    description: String(body.description || "").trim(),
    amount: roundMoney(Number(body.amount || 0)),
    expense_date: body.expenseDate || new Date().toISOString().slice(0, 10),
    receipt_file_id: body.receiptFileId || null,
    ocr_data: body.ocrData && typeof body.ocrData === "object" ? body.ocrData : {},
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    created_by: userId || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from(JOB_EXPENSE_TABLE)
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  await refreshJobCostTotals(tenantDbId, jobId);
  return serializeJobExpense(data);
}

export async function deleteJobExpense(tenantDbId, expenseId) {
  const { data: existing, error: findError } = await supabaseAdmin
    .from(JOB_EXPENSE_TABLE)
    .select("job_id")
    .eq("tenant_id", tenantDbId)
    .eq("id", expenseId)
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (!existing) throw new Error("Expense not found");

  const { error } = await supabaseAdmin
    .from(JOB_EXPENSE_TABLE)
    .delete()
    .eq("tenant_id", tenantDbId)
    .eq("id", expenseId);

  if (error) throw new Error(error.message);
  await refreshJobCostTotals(tenantDbId, existing.job_id);
  return { deleted: true };
}

export async function refreshJobCostTotals(tenantDbId, jobId) {
  const { data: expenses, error } = await supabaseAdmin
    .from(JOB_EXPENSE_TABLE)
    .select("category, amount")
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);

  const summary = summarizeExpensesByCategory(expenses || []);

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("labor_burden_total")
    .eq("tenant_id", tenantDbId)
    .eq("id", jobId)
    .maybeSingle();

  const laborBurden = Number(job?.labor_burden_total || 0);
  const material = summary.byCategory.material + summary.byCategory.vendor;
  const equipment =
    summary.byCategory.equipment +
    (await sumEquipmentAssignmentCosts(tenantDbId, jobId));
  const subcontractor = summary.byCategory.subcontractor;
  const other =
    summary.byCategory.dump_fee +
    summary.byCategory.fuel +
    summary.byCategory.other;

  const totalJobCost = roundMoney(laborBurden + summary.total);

  await supabaseAdmin
    .from("jobs")
    .update({
      material_cost_total: roundMoney(material),
      equipment_cost_total: roundMoney(equipment),
      subcontractor_cost_total: roundMoney(subcontractor),
      other_cost_total: roundMoney(other),
      total_job_cost: totalJobCost,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantDbId)
    .eq("id", jobId);

  return {
    materialCost: roundMoney(material),
    equipmentCost: roundMoney(equipment),
    subcontractorCost: roundMoney(subcontractor),
    otherCost: roundMoney(other),
    totalJobCost,
    byCategory: summary.byCategory,
  };
}

async function sumEquipmentAssignmentCosts(tenantDbId, jobId) {
  const { data, error } = await supabaseAdmin
    .from(EQUIPMENT_ASSIGNMENTS_TABLE)
    .select("cost_amount")
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId);

  if (error) throw new Error(error.message);
  return (data || []).reduce((sum, row) => sum + Number(row.cost_amount || 0), 0);
}

export function serializeEquipment(row = {}) {
  return {
    id: row.id,
    name: row.name || "",
    equipmentType: row.equipment_type || "",
    hourlyRate: Number(row.hourly_rate || 0),
    purchaseCost: Number(row.purchase_cost || 0),
    maintenanceSchedule: row.maintenance_schedule || "",
    lastServiceDate: row.last_service_date || null,
    nextServiceDate: row.next_service_date || null,
    status: row.status || "active",
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
  };
}

export async function listEquipment(tenantDbId) {
  const { data, error } = await supabaseAdmin
    .from(EQUIPMENT_TABLE)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .order("name");

  if (error) throw new Error(error.message);
  return (data || []).map(serializeEquipment);
}

export async function assignEquipmentToJob(tenantDbId, userId, body = {}) {
  const hours = Number(body.hours || 0);
  const hourlyRate = Number(body.hourlyRate || 0);
  const costAmount = roundMoney(body.costAmount ?? hours * hourlyRate);

  const { data, error } = await supabaseAdmin
    .from(EQUIPMENT_ASSIGNMENTS_TABLE)
    .insert({
      tenant_id: tenantDbId,
      equipment_id: body.equipmentId,
      job_id: body.jobId,
      hours,
      cost_amount: costAmount,
      assigned_date: body.assignedDate || new Date().toISOString().slice(0, 10),
      notes: String(body.notes || ""),
      created_by: userId || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  await refreshJobCostTotals(tenantDbId, body.jobId);
  return data;
}

export async function createEquipment(tenantDbId, body = {}) {
  const name = String(body.name || "").trim();
  if (!name) throw new Error("Equipment name is required");
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(EQUIPMENT_TABLE)
    .insert({
      tenant_id: tenantDbId,
      name,
      equipment_type: String(body.equipmentType || "").trim(),
      hourly_rate: Number(body.hourlyRate || 0),
      purchase_cost: Number(body.purchaseCost || 0),
      maintenance_schedule: String(body.maintenanceSchedule || ""),
      last_service_date: body.lastServiceDate || null,
      next_service_date: body.nextServiceDate || null,
      status: body.status || "active",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return serializeEquipment(data);
}

export async function listEquipmentAssignments(tenantDbId, jobId) {
  const { data, error } = await supabaseAdmin
    .from(EQUIPMENT_ASSIGNMENTS_TABLE)
    .select("*, equipment(name, equipment_type, hourly_rate)")
    .eq("tenant_id", tenantDbId)
    .eq("job_id", jobId)
    .order("assigned_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    equipmentId: row.equipment_id,
    equipmentName: row.equipment?.name || "",
    hours: Number(row.hours || 0),
    costAmount: Number(row.cost_amount || 0),
    assignedDate: row.assigned_date,
    notes: row.notes || "",
  }));
}
