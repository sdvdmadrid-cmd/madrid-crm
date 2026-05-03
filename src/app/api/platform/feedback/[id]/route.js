import { isAdminRole } from "@/lib/access-control";
import { normalizeUuid } from "@/lib/supabase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

const FEEDBACK_TABLE = "product_feedback";
const FEEDBACK_STATUSES = new Set(["new", "reviewed", "resolved"]);

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return FEEDBACK_STATUSES.has(normalized) ? normalized : "";
}

export async function PATCH(request, { params }) {
  const context = await getAuthenticatedTenantContext(request);
  if (!context?.authenticated || !isAdminRole(context.role)) {
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const feedbackId = normalizeUuid(params?.id);
  if (!feedbackId) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid feedback id" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const status = normalizeStatus(body.status);
  if (!status) {
    return new Response(
      JSON.stringify({ success: false, error: "Valid status is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const nowIso = new Date().toISOString();
  const patchPayload = {
    status,
    reviewed_by: context.userId,
    reviewed_at: status === "new" ? null : nowIso,
    updated_at: nowIso,
  };

  let query = supabaseAdmin
    .from(FEEDBACK_TABLE)
    .update(patchPayload)
    .eq("id", feedbackId)
    .select(
      // screenshot_data_url excluded from update response for consistency with list endpoint
      "id,tenant_id,user_id,feedback_type,message,current_page,status,reviewed_by,reviewed_at,created_at,updated_at",
    )
    .maybeSingle();

  if (!context.isSuperAdmin) {
    query = query.eq("tenant_id", context.tenantDbId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[api/platform/feedback/id][PATCH] DB error", error);
    return new Response(
      JSON.stringify({ success: false, error: "Unable to update feedback" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!data) {
    return new Response(
      JSON.stringify({ success: false, error: "Feedback not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
