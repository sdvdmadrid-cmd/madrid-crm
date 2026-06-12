import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import { scopeByTenant } from "@/lib/tenant-scope";
import { applyListSearchOr } from "@/lib/list-search-server";

const JOBS = "jobs";

export const JOBS_UI_PAGE_SIZE = 50;

export function serializeJobRow(doc) {
  return {
    _id: doc.id,
    id: doc.id,
    tenantId: doc.tenant_id || "",
    userId: doc.user_id || null,
    title: doc.title || "",
    description: doc.description || "",
    clientId: doc.client_id || "",
    clientName: doc.client_name || "",
    service: doc.service || "",
    status: doc.status || "Pending",
    price: doc.price || "",
    dueDate: doc.due_date || "",
    taxState: doc.tax_state || "",
    downPaymentPercent: doc.down_payment_percent || "0",
    scopeDetails: doc.scope_details || "",
    squareMeters: doc.square_meters || "",
    complexity: doc.complexity || "standard",
    materialsIncluded:
      typeof doc.materials_included === "boolean" ? doc.materials_included : true,
    travelMinutes: doc.travel_minutes || "",
    urgency: doc.urgency || "flexible",
    estimateSnapshot: doc.estimate_snapshot || null,
    laborCostTotal: Number(doc.labor_cost_total || 0),
    laborHoursTotal: Number(doc.labor_hours_total || 0),
    laborBurdenTotal: Number(doc.labor_burden_total || 0),
    quoteToken: doc.quote_token || null,
    quoteSharedAt: doc.quote_shared_at || null,
    quoteSentAt: doc.quote_sent_at || null,
    quoteSentTo: doc.quote_sent_to || "",
    invoiced: typeof doc.invoiced === "boolean" ? doc.invoiced : false,
    createdAt: doc.created_at || null,
    updatedAt: doc.updated_at || null,
  };
}

export async function listJobsForTenant(
  { tenantDbId, role, page = 1, limit = JOBS_UI_PAGE_SIZE, search = "" } = {},
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || JOBS_UI_PAGE_SIZE));
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = scopeByTenant(
    supabaseAdmin
      .from(JOBS)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false }),
    { tenantDbId, role },
  );

  query = applyListSearchOr(
    query,
    ["title", "client_name", "service", "description", "status"],
    search,
  );

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    logSupabaseError("[jobs-list-server] Supabase query error", error, {
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }

  const total = Number(count || 0);
  const docs = (data || []).map(serializeJobRow);

  return {
    data: docs,
    total,
    page: safePage,
    limit: safeLimit,
    pages: safeLimit > 0 ? Math.max(1, Math.ceil(total / safeLimit)) : 1,
  };
}
