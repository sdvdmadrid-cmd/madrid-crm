import "server-only";

import { PAYROLL_TABLES, MUTABLE_RUN_STATUSES } from "./payroll-constants.js";
import { roundMoney } from "./payroll-money.js";
import { getPayrollSettingsForTenant } from "./payroll-settings-service.js";
import {
  aggregateTimeForPayRun,
  buildRunLineFromTimeEntries,
  computeHoursFromClock,
  groupTimeEntriesByEmployee,
} from "./payroll-time-utils.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { scopeByTenant } from "./tenant-scope.js";

export {
  aggregateTimeForPayRun,
  buildRunLineFromTimeEntries,
  groupTimeEntriesByEmployee,
} from "./payroll-time-utils.js";

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

export async function importTimeEntriesForRun({ tenantDbId, role, runId }) {
  const { data: run, error: runError } = await scopeByTenant(
    supabaseAdmin.from(PAYROLL_TABLES.RUNS).select("*").eq("id", runId).maybeSingle(),
    { tenantDbId, role },
  );
  if (runError) throw new Error(runError.message);
  if (!run) throw new Error("Pay run not found.");
  if (!MUTABLE_RUN_STATUSES.has(String(run.status || "").toLowerCase())) {
    throw new Error("This pay run is locked and cannot be modified.");
  }

  const settings = await getPayrollSettingsForTenant({ tenantDbId, role });
  const scheduleType = run.schedule_type || settings.defaultPaySchedule || "biweekly";
  const periodStart = run.period_start;
  const periodEnd = run.period_end;

  const { data: timeEntries, error: entriesError } = await supabaseAdmin
    .from(PAYROLL_TABLES.TIME_ENTRIES)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .in("status", ["submitted", "approved"])
    .gte("created_at", `${periodStart}T00:00:00Z`)
    .lte("created_at", `${periodEnd}T23:59:59Z`);

  if (entriesError) throw new Error(entriesError.message);

  const { data: employees, error: employeesError } = await supabaseAdmin
    .from(PAYROLL_TABLES.EMPLOYEES)
    .select("id, hourly_rate")
    .eq("tenant_id", tenantDbId)
    .eq("status", "active");

  if (employeesError) throw new Error(employeesError.message);

  const rateByEmployee = new Map(
    (employees || []).map((emp) => [emp.id, Number(emp.hourly_rate || 0)]),
  );

  const grouped = groupTimeEntriesByEmployee(
    (timeEntries || []).map((entry) => ({
      employeeId: entry.employee_id,
      hours: entry.hours,
      entryType: entry.entry_type,
      hourlyRate: entry.hourly_rate,
    })),
  );

  const now = new Date().toISOString();
  let importedCount = 0;
  let autoSplitCount = 0;
  const lines = [];

  for (const [employeeId, entries] of grouped) {
    const line = buildRunLineFromTimeEntries(entries, settings, scheduleType);
    const totalHours =
      line.hoursRegular + line.hoursOvertime + line.ptoHours + line.sickHours;
    if (totalHours <= 0) continue;

    const hourlyRate = line.hourlyRate || rateByEmployee.get(employeeId) || 0;
    const itemRow = {
      tenant_id: tenantDbId,
      run_id: runId,
      employee_id: employeeId,
      hours_regular: line.hoursRegular,
      hours_overtime: line.hoursOvertime,
      pto_hours: line.ptoHours,
      sick_hours: line.sickHours,
      hourly_rate: hourlyRate,
      updated_at: now,
      created_at: now,
    };

    await supabaseAdmin.from(PAYROLL_TABLES.RUN_ITEMS).upsert(itemRow, {
      onConflict: "run_id,employee_id",
    });

    importedCount += 1;
    if (line.autoSplitApplied) autoSplitCount += 1;
    lines.push({
      employeeId,
      ...line,
      hourlyRate,
    });
  }

  await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .update({ updated_at: now })
    .eq("id", runId);

  return {
    importedCount,
    autoSplitCount,
    autoSplitOvertime: settings.autoSplitOvertime !== false,
    lines,
  };
}
