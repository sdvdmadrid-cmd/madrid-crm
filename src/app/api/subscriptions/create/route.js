import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import {
  createContractorSubscription,
  getStripeServerClient,
} from "@/lib/stripe-payments";
import { sendSubscriptionConfirmationEmail } from "@/lib/subscription-emails";

/**
 * POST /api/subscriptions/create
 *
 * Create a new subscription for the authenticated tenant.
 * Free trial period: 30 days
 * Recurring billing: $35/month
 */
export async function POST(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);

    if (!context.authenticated) {
      return unauthenticatedResponse();
    }

    // Only allow tenants to manage their own subscriptions
    if (!canWrite(context.role)) {
      return forbiddenResponse();
    }

    const stripe = getStripeServerClient();
    if (!stripe) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Stripe is not configured",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check if tenant already has an active subscription
    const { data: existing, error: checkError } = await supabaseAdmin
      .from("contractor_subscriptions")
      .select("id, status")
      .eq("tenant_id", context.tenantDbId)
      .in("status", ["trialing", "active"])
      .maybeSingle();

    if (checkError) {
      throw new Error(`Error checking existing subscription: ${checkError.message}`);
    }

    if (existing) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "You already have an active subscription",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get the default plan (Contractor Pro at $35/month)
    const { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select("id")
      .eq("name", "Contractor Pro")
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Subscription plan not found",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get tenant email from auth
    const { data: tenantData, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("tenant_name, email")
      .eq("id", context.tenantDbId)
      .single();

    if (tenantError) {
      throw new Error(`Error fetching tenant: ${tenantError.message}`);
    }

    // Create subscription
    const subscription = await createContractorSubscription({
      tenantId: context.tenantDbId,
      planId: plan.id,
      email: tenantData.email || context.email,
      name: tenantData.tenant_name || "Contractor",
      trialDays: 30,
    });

    // Send confirmation email
    const planData = await supabaseAdmin
      .from("subscription_plans")
      .select("name, price_monthly")
      .eq("id", plan.id)
      .single();

    if (planData.data) {
      await sendSubscriptionConfirmationEmail({
        tenantId: context.tenantDbId,
        email: tenantData.email || context.email,
        tenantName: tenantData.tenant_name || "Contractor",
        planName: planData.data.name,
        trialDays: 30,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          trialEndsAt: subscription.trial_ends_at,
          currentPeriodEnd: subscription.current_period_end,
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[subscriptions/create] error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to create subscription",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
