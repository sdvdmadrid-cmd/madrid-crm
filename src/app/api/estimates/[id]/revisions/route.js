import { listEstimateRevisions } from "@/lib/estimate-revisions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ESTIMATES_TABLE = "estimates";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/estimates/:id/revisions
 *
 * Returns the append-only revision history for an estimate. Tenant scoped:
 * non-super-admin users only see revisions for estimates inside their own
 * tenant. We first verify the estimate belongs to the caller before
 * returning any history rows to avoid leaking via a guessed id.
 */
export async function GET(request, { params }) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) {
      return jsonResponse({ success: false, error: "Invalid estimate id" }, 400);
    }

    let query = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("id, tenant_id")
      .eq("id", id)
      .maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data: estimate, error } = await query;
    if (error) throw new Error(error.message);
    if (!estimate) {
      return jsonResponse({ success: false, error: "Estimate not found" }, 404);
    }

    const tenantScope =
      (role || "").toLowerCase() === "super_admin" ? null : estimate.tenant_id;

    const revisions = await listEstimateRevisions({
      estimateId: estimate.id,
      tenantId: tenantScope,
      limit: 100,
    });

    return jsonResponse({ success: true, data: revisions });
  } catch (err) {
    console.error("[api/estimates/:id/revisions][GET] error", err);
    return jsonResponse({ success: false, error: err.message || "Failed to list revisions" }, 500);
  }
}
