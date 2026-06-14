import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { scopeByTenant } from "@/lib/tenant-scope";
import { isSuperAdminRole } from "@/lib/access-control";
import { LEAD_STATUSES } from "@/lib/website-lead-form";

export async function PATCH(request, { params }) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status = String(body.status || "").trim().toLowerCase();

    if (!LEAD_STATUSES.includes(status)) {
      return Response.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("contractor_website_leads")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status, updated_at")
      .maybeSingle();

    if (!isSuperAdminRole(role)) {
      query = scopeByTenant(query, { tenantDbId, role });
    }

    const { data, error } = await query;

    if (error) {
      console.error("[api/lead-inbox/leads][PATCH]", error);
      return Response.json({ success: false, error: "Update failed" }, { status: 500 });
    }

    if (!data?.id) {
      return Response.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error("[api/lead-inbox/leads][PATCH] error", error);
    return Response.json({ success: false, error: "Update failed" }, { status: 500 });
  }
}
