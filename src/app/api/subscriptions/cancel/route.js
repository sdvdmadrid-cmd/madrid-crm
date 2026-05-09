import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { cancelContractorSubscription } from "@/lib/stripe-payments";

/**
 * POST /api/subscriptions/cancel
 *
 * Cancel the current subscription for the authenticated tenant
 */
export async function POST(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);

    if (!context.authenticated) {
      return unauthenticatedResponse();
    }

    // Only allow tenants to manage their own subscriptions
    if (!context.canWrite) {
      return forbiddenResponse();
    }

    // Get current subscription
    const { data: subscription, error: queryError } = await supabaseAdmin
      .from("contractor_subscriptions")
      .select("id, status")
      .eq("tenant_id", context.tenantDbId)
      .in("status", ["trialing", "active", "paused"])
      .maybeSingle();

    if (queryError) {
      throw new Error(`Error finding subscription: ${queryError.message}`);
    }

    if (!subscription) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No active subscription found",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Cancel the subscription
    await cancelContractorSubscription(subscription.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Subscription cancelled successfully",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[subscriptions/cancel] error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to cancel subscription",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
