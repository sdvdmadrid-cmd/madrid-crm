import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { roundMoney } from "./payroll-money.js";
import { aggregateTimeForPayRun, computeHoursFromClock } from "./payroll-time-utils.js";
import { supabaseAdmin } from "./supabase-admin.js";

export { aggregateTimeForPayRun } from "./payroll-time-utils.js";

export function serializeTimeEntry(row = {}) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    employeeId: row.employee_id,
    jobId: row.job_id || null,
    entryType: row.entry_type || "regular",
    status: row.status || "open",
    clockIn: row.clock_in || null,
    clockOut: row.clock_out || null,
    hours: Number(row.hours || 0),
    hourlyRate: Number(row.hourly_rate || 0),
    payRunItemId: row.pay_run_item_id || null,
    notes: row.notes || "",
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function clockIn({
  tenantDbId,
  employeeId,
  jobId,
  hourlyRate,
  userId,
  metadata = {},
}) {
  const now = new Date().toISOString();

  const { data: openEntry } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .select("id")
    .eq("tenant_id", tenantDbId)
    .eq("employee_id", employeeId)
    .eq("status", "open")
    .is("clock_out", null)
    .maybeSingle();

  if (openEntry?.id) {
    throw new Error("Employee already clocked in.");
  }

  const row = {
    tenant_id: tenantDbId,
    employee_id: employeeId,
    job_id: jobId || null,
    entry_type: "regular",
    status: "open",
    clock_in: now,
    clock_out: null,
    hours: 0,
    hourly_rate: Number(hourlyRate || 0),
    metadata,
    created_by: userId || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return serializeTimeEntry(data);
}

export async function clockOut({ tenantDbId, employeeId, notes = "" }) {
  const { data: openEntry, error: findError } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("employee_id", employeeId)
    .eq("status", "open")
    .is("clock_out", null)
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (!openEntry) throw new Error("No open clock-in found.");

  const now = new Date().toISOString();
  const hours = computeHoursFromClock(openEntry.clock_in, now);

  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .update({
      clock_out: now,
      hours,
      status: "submitted",
      notes: notes || openEntry.notes || "",
      updated_at: now,
    })
    .eq("id", openEntry.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return serializeTimeEntry(data);
}

export async function createManualTimeEntry({
  tenantDbId,
  employeeId,
  jobId,
  entryType = "regular",
  hours,
  hourlyRate,
  notes = "",
  userId,
}) {
  const now = new Date().toISOString();
  const row = {
    tenant_id: tenantDbId,
    employee_id: employeeId,
    job_id: jobId || null,
    entry_type: entryType,
    status: "submitted",
    clock_in: null,
    clock_out: null,
    hours: roundMoney(hours),
    hourly_rate: Number(hourlyRate || 0),
    notes,
    created_by: userId || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return serializeTimeEntry(data);
}

export async function listTimeEntries({
  tenantDbId,
  employeeId,
  jobId,
  status,
  limit = 100,
  offset = 0,
}) {
  let query = supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantDbId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (employeeId) query = query.eq("employee_id", employeeId);
  if (jobId) query = query.eq("job_id", jobId);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    items: (data || []).map(serializeTimeEntry),
    total: count || 0,
    limit,
    offset,
  };
}

export async function approveTimeEntry({ tenantDbId, entryId }) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .update({ status: "approved", updated_at: now })
    .eq("tenant_id", tenantDbId)
    .eq("id", entryId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return serializeTimeEntry(data);
}
