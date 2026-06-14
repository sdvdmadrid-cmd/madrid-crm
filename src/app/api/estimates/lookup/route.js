import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

/**
 * GET /api/estimates/lookup?q=<number>
 * Searches pipeline estimates by number.
 * Accepts: "2", "#2", "EST-0002", "EST-2"
 * Returns the best match for the current tenant.
 */
export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const { searchParams } = new URL(request.url);
    const rawQ = String(searchParams.get("q") || "").trim();
    if (!rawQ) {
      return new Response(JSON.stringify({ success: true, data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Normalize: strip leading # or spaces
    const stripped = rawQ.replace(/^#+/, "").trim();

    // Build candidate patterns to try
    const candidates = new Set([stripped]);
    // If purely numeric, also try EST-XXXX zero-padded
    if (/^\d+$/.test(stripped)) {
      candidates.add(`EST-${stripped.padStart(4, "0")}`);
      candidates.add(`EST-${stripped}`);
    }
    // If already EST-N format, also try the plain number
    const estMatch = stripped.match(/^EST-0*(\d+)$/i);
    if (estMatch) {
      candidates.add(estMatch[1]);
      candidates.add(`EST-${estMatch[1].padStart(4, "0")}`);
    }

    const candidateList = Array.from(candidates);

    // Search estimates table first
    const { data: estRows } = await supabaseAdmin
      .from("estimates")
      .select("id, estimate_number, client_name, total, status")
      .eq("tenant_id", tenantDbId)
      .in("estimate_number", candidateList)
      .order("created_at", { ascending: false })
      .limit(1);

    if (estRows && estRows.length > 0) {
      const row = estRows[0];
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: row.id,
            estimateNumber: row.estimate_number,
            clientName: row.client_name || "",
            total: row.total || 0,
            status: row.status || "",
            source: "estimates",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/estimates/lookup][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
