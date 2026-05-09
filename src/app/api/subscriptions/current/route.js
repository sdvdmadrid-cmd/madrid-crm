import "server-only";

import {
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getContractorSubscription } from "@/lib/stripe-payments";

/**
 * GET /api/subscriptions/current
 *
 * Get the current subscription for the authenticated tenant
 */
export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);

    if (!context.authenticated) {
      return unauthenticatedResponse();
    }

    const subscription = await getContractorSubscription(context.tenantDbId);

    if (!subscription) {
      return new Response(
        JSON.stringify({
          success: true,
          subscription: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscription: {
          id: subscription.id,
          planId: subscription.plan_id,
          planName: subscription.subscription_plans?.name,
          priceMonthly: subscription.subscription_plans?.price_monthly,
          features: subscription.subscription_plans?.features,
          status: subscription.status,
          trialEndsAt: subscription.trial_ends_at,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelledAt: subscription.cancelled_at,
          createdAt: subscription.created_at,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[subscriptions/current] error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to fetch subscription",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
