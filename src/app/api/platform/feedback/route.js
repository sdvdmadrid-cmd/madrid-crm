import { isAdminRole } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

const FEEDBACK_TABLE = "product_feedback";

function sortDirectionFromUrl(url) {
  const value = String(url.searchParams.get("dir") || "desc").toLowerCase();
  return value === "asc" ? "asc" : "desc";
}

function normalizeStatusFilter(url) {
  const value = String(url.searchParams.get("status") || "all")
    .trim()
    .toLowerCase();
  return ["all", "new", "reviewed", "resolved"].includes(value)
    ? value
    : "all";
}

function normalizeTypeFilter(url) {
  const value = String(url.searchParams.get("type") || "all")
    .trim()
    .toLowerCase();
  return ["all", "suggestion", "issue", "improvement"].includes(value)
    ? value
    : "all";
}

export async function GET(request) {
  const context = await getAuthenticatedTenantContext(request);
  if (!context?.authenticated || !isAdminRole(context.role)) {
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(request.url);
  const typeFilter = normalizeTypeFilter(url);
  const statusFilter = normalizeStatusFilter(url);
  const sortDirection = sortDirectionFromUrl(url);

  let query = supabaseAdmin
    .from(FEEDBACK_TABLE)
    .select(
      // screenshot_data_url intentionally excluded from list – can be 2MB+ per row.
      // Clients can request it individually if needed.
      "id,tenant_id,user_id,feedback_type,message,current_page,status,reviewed_by,reviewed_at,created_at,updated_at",
    );

  if (!context.isSuperAdmin) {
    query = query.eq("tenant_id", context.tenantDbId);
  }
  if (typeFilter !== "all") {
    query = query.eq("feedback_type", typeFilter);
  }
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query.order("created_at", {
    ascending: sortDirection === "asc",
  });

  if (error) {
    console.error("[api/platform/feedback][GET] DB error", error);
    return new Response(
      JSON.stringify({ success: false, error: "Unable to load feedback" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ success: true, data: data || [] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
