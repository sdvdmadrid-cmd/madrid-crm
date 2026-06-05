import "server-only";

import { supabaseAdmin } from "./supabase-admin.js";
import { scopeByTenant } from "./tenant-scope.js";

export const JOB_DAILY_REPORTS_TABLE = "job_daily_reports";

function toText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeCrew(crew = []) {
  if (!Array.isArray(crew)) return [];
  return crew
    .map((entry) => ({
      name: toText(entry?.name || entry?.memberName, 120),
      hours: Number(entry?.hours || 0),
      employeeId: entry?.employeeId || entry?.employee_id || null,
    }))
    .filter((entry) => entry.name);
}

export function serializeDailyReport(row = {}) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobId: row.job_id,
    userId: row.user_id,
    reportDate: row.report_date,
    crew: normalizeCrew(row.crew),
    materials: row.materials || "",
    equipment: row.equipment || "",
    weather: row.weather || "",
    notes: row.notes || "",
    photoFileIds: row.photo_file_ids || [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function buildDailyReportRow(body = {}, tenantId, userId, jobId) {
  const now = new Date().toISOString();
  return {
    tenant_id: tenantId,
    job_id: jobId,
    user_id: userId,
    report_date: body.reportDate || new Date().toISOString().slice(0, 10),
    crew: normalizeCrew(body.crew),
    materials: toText(body.materials, 2000),
    equipment: toText(body.equipment, 2000),
    weather: toText(body.weather, 200),
    notes: toText(body.notes, 4000),
    photo_file_ids: Array.isArray(body.photoFileIds) ? body.photoFileIds : [],
    created_at: now,
    updated_at: now,
  };
}

export async function listDailyReportsForJob({ tenantDbId, role, jobId }) {
  const { data, error } = await scopeByTenant(
    supabaseAdmin
      .from(JOB_DAILY_REPORTS_TABLE)
      .select("*")
      .eq("job_id", jobId)
      .order("report_date", { ascending: false }),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  return (data || []).map(serializeDailyReport);
}

export async function createDailyReport({ tenantDbId, role, userId, jobId, body }) {
  const row = buildDailyReportRow(body, tenantDbId, userId, jobId);
  const { data, error } = await supabaseAdmin
    .from(JOB_DAILY_REPORTS_TABLE)
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return serializeDailyReport(data);
}

export async function updateDailyReport({ tenantDbId, role, jobId, reportId, body }) {
  const updateRow = { updated_at: new Date().toISOString() };
  if ("reportDate" in body) updateRow.report_date = body.reportDate;
  if ("crew" in body) updateRow.crew = normalizeCrew(body.crew);
  if ("materials" in body) updateRow.materials = toText(body.materials, 2000);
  if ("equipment" in body) updateRow.equipment = toText(body.equipment, 2000);
  if ("weather" in body) updateRow.weather = toText(body.weather, 200);
  if ("notes" in body) updateRow.notes = toText(body.notes, 4000);
  if ("photoFileIds" in body) {
    updateRow.photo_file_ids = Array.isArray(body.photoFileIds) ? body.photoFileIds : [];
  }

  const { data, error } = await scopeByTenant(
    supabaseAdmin
      .from(JOB_DAILY_REPORTS_TABLE)
      .update(updateRow)
      .eq("id", reportId)
      .eq("job_id", jobId)
      .select("*")
      .maybeSingle(),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Daily report not found.");
  return serializeDailyReport(data);
}

export async function deleteDailyReport({ tenantDbId, role, jobId, reportId }) {
  const { error } = await scopeByTenant(
    supabaseAdmin
      .from(JOB_DAILY_REPORTS_TABLE)
      .delete()
      .eq("id", reportId)
      .eq("job_id", jobId),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
}
