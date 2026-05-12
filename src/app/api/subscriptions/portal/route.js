import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getStripeServerClient } from "@/lib/stripe-payments";

export async function POST(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);

    if (!context.authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(context.role)) {
      return forbiddenResponse();
    }

    const stripe = getStripeServerClient();
    if (!stripe) {
      return new Response(
        JSON.stringify({ success: false, error: "Stripe is not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: subscription, error: queryError } = await supabaseAdmin
      .from("contractor_subscriptions")
      .select("stripe_customer_id, status")
      .eq("tenant_id", context.tenantDbId)
      .in("status", ["trialing", "active", "past_due", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      throw new Error(`Error finding subscription: ${queryError.message}`);
    }

    if (!subscription?.stripe_customer_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No subscription customer found for billing setup",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const origin = new URL(request.url).origin;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/subscriptions?billing=updated`,
    });

    return new Response(
      JSON.stringify({ success: true, url: portalSession.url }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[subscriptions/portal] error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to create billing portal session",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
