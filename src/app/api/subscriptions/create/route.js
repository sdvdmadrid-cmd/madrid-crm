import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
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
 * Free trial period: 15 days
 * Recurring billing: $35/month
 */
export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const requestBody = await request
      .json()
      .catch(() => ({}));
    const source = String(requestBody?.source || "app").trim().toLowerCase();
    const isBillPaymentsSource = source === "bill-payments";

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

    const desiredPlanName = isBillPaymentsSource
      ? "Bill Payments Pro"
      : "Contractor Pro";
    let { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select("id")
      .eq("name", desiredPlanName)
      .eq("is_active", true)
      .maybeSingle();

    if (!plan && !planError && isBillPaymentsSource) {
      const configuredPrice = Number.parseFloat(
        process.env.BILL_PAYMENTS_MONTHLY_FEE_USD || "5",
      );
      const fallbackPrice = Number.isFinite(configuredPrice)
        ? Math.max(1, Math.round(configuredPrice * 100) / 100)
        : 5;

      const upsertResult = await supabaseAdmin
        .from("subscription_plans")
        .upsert(
          {
            name: desiredPlanName,
            description: "Bill Payments subscription",
            price_monthly: fallbackPrice,
            trial_days: 0,
            features: [
              "Bill payments dashboard",
              "Saved payment methods",
              "AutoPay scheduling",
              "Payment tracking",
            ],
            is_active: true,
          },
          { onConflict: "name" },
        )
        .select("id")
        .single();

      plan = upsertResult.data;
      planError = upsertResult.error;
    }

    if (planError || !plan) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Subscription plan not found: ${desiredPlanName}`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const tenantEmail = context.email || context.supabaseUser?.email || null;
    const tenantName =
      String(context.companyName || "").trim() ||
      String(context.name || "").trim() ||
      "Contractor";

    // Create subscription
    const subscription = await createContractorSubscription({
      tenantId: context.tenantDbId,
      planId: plan.id,
      email: tenantEmail,
      name: tenantName,
      userId: context.userId,
      trialDays: isBillPaymentsSource ? 0 : 15,
      source: isBillPaymentsSource ? "bill-payments" : "app",
    });

    // If this is a Bill Payments subscription, mark the user's metadata
    if (isBillPaymentsSource && context.userId) {
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      await admin.auth.admin.updateUserById(context.userId, {
        user_metadata: { billPaymentsSubscribed: true },
      });
    }

    // Send confirmation email
    const planData = await supabaseAdmin
      .from("subscription_plans")
      .select("name, price_monthly")
      .eq("id", plan.id)
      .single();

    if (planData.data) {
      await sendSubscriptionConfirmationEmail({
        tenantId: context.tenantDbId,
        email: tenantEmail,
        tenantName,
        planName: planData.data.name,
        planPriceMonthly: planData.data.price_monthly,
        trialDays: isBillPaymentsSource ? 0 : 15,
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
