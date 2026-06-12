import "server-only";

import { isValidYmd } from "@/lib/local-date";
import { serializeJobRow } from "@/lib/jobs-list-server";
import { serializeEstimateBase } from "@/lib/estimate-serializer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import { scopeByTenant } from "@/lib/tenant-scope";

function normalizeDateKey(value) {
  const raw = String(value || "").trim();
  if (isValidYmd(raw)) return raw;
  if (isValidYmd(raw.slice(0, 10))) return raw.slice(0, 10);
  return "";
}

export async function listCalendarJobsForRange(
  { tenantDbId, role, from, to } = {},
) {
  if (!from || !to) return [];

  let query = scopeByTenant(
    supabaseAdmin
      .from("jobs")
      .select("id, title, client_name, status, due_date, service, tenant_id")
      .not("due_date", "is", null)
      .neq("due_date", "")
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date", { ascending: true }),
    { tenantDbId, role },
  );

  const { data, error } = await query;
  if (error) {
    logSupabaseError("[calendar-events] jobs query error", error, {
      tenantDbId,
      from,
      to,
    });
    throw new Error(error.message);
  }

  return (data || [])
    .map(serializeJobRow)
    .filter((row) => normalizeDateKey(row.dueDate));
}

export async function listCalendarEstimatesForRange(
  { tenantDbId, role, from, to } = {},
) {
  if (!from || !to) return [];

  let query = scopeByTenant(
    supabaseAdmin
      .from("estimates")
      .select(
        "id, tenant_id, client_name, status, estimate_number, scheduled_visit_date",
      )
      .not("scheduled_visit_date", "is", null)
      .gte("scheduled_visit_date", from)
      .lte("scheduled_visit_date", to)
      .order("scheduled_visit_date", { ascending: true }),
    { tenantDbId, role },
  );

  const { data, error } = await query;
  if (error) {
    logSupabaseError("[calendar-events] estimates query error", error, {
      tenantDbId,
      from,
      to,
    });
    throw new Error(error.message);
  }

  return (data || [])
    .map((row) => {
      const base = serializeEstimateBase(row);
      return {
        ...base,
        scheduledVisitDate: normalizeDateKey(row.scheduled_visit_date),
      };
    })
    .filter((row) => row.scheduledVisitDate);
}

export async function getCalendarEventsForRange(
  { tenantDbId, role, from, to } = {},
) {
  const [jobs, estimates] = await Promise.all([
    listCalendarJobsForRange({ tenantDbId, role, from, to }),
    listCalendarEstimatesForRange({ tenantDbId, role, from, to }),
  ]);

  return { jobs, estimates };
}
