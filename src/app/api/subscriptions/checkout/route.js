import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  complimentaryBillingBlockedPayload,
  isComplimentaryTenant,
} from "@/lib/complimentary-access";
import {
  createSubscriptionCheckoutSession,
  getOrCreateStripeCustomer,
  getStripeServerClient,
} from "@/lib/stripe-payments";
import { getRequestOrigin } from "@/lib/supabase-auth";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

/**
 * POST /api/subscriptions/checkout
 * Starts Stripe Checkout for FieldBase SaaS subscription.
 */
export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const context = await getAuthenticatedTenantContext(request);
    if (!context.authenticated) return unauthenticatedResponse();
    if (!canWrite(context.role)) return forbiddenResponse();

    if (isComplimentaryTenant(context.tenantDbId)) {
      return json(complimentaryBillingBlockedPayload(), 403);
    }

    const stripe = getStripeServerClient();
    if (!stripe) {
      return json({ success: false, error: "Stripe is not configured" }, 503);
    }

    const { data: activeSub } = await supabaseAdmin
      .from("contractor_subscriptions")
      .select("id, status")
      .eq("tenant_id", context.tenantDbId)
      .in("status", ["trialing", "active"])
      .maybeSingle();

    if (activeSub) {
      return json(
        {
          success: false,
          error: "You already have an active subscription.",
          code: "SUBSCRIPTION_EXISTS",
        },
        400,
      );
    }

    let { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("id")
      .eq("name", "Contractor Pro")
      .eq("is_active", true)
      .maybeSingle();

    if (!plan) {
      const upsert = await supabaseAdmin
        .from("subscription_plans")
        .upsert(
          {
            name: "Contractor Pro",
            description: "FieldBase contractor workspace",
            price_monthly: 35,
            trial_days: 0,
            features: ["Clients", "Jobs", "Estimates", "Invoices", "Payroll"],
            is_active: true,
          },
          { onConflict: "name" },
        )
        .select("id")
        .single();
      plan = upsert.data;
    }

    if (!plan?.id) {
      return json({ success: false, error: "Subscription plan not found" }, 404);
    }

    const origin = getRequestOrigin(request) || new URL(request.url).origin;
    const tenantEmail = context.email || context.supabaseUser?.email || null;
    const tenantName =
      String(context.companyName || "").trim() ||
      String(context.name || "").trim() ||
      "Contractor";

    await getOrCreateStripeCustomer(context.tenantDbId, tenantEmail, tenantName);

    const checkout = await createSubscriptionCheckoutSession({
      tenantId: context.tenantDbId,
      planId: plan.id,
      email: tenantEmail,
      name: tenantName,
      userId: context.userId,
      origin,
      trialDays: 0,
      source: "app",
    });

    if (!checkout.url) {
      return json(
        { success: false, error: "Stripe did not return a checkout URL" },
        502,
      );
    }

    return json({
      success: true,
      url: checkout.url,
      sessionId: checkout.sessionId,
    });
  } catch (error) {
    console.error("[subscriptions/checkout] error:", error);
    return json(
      {
        success: false,
        error: error.message || "Unable to start checkout",
      },
      500,
    );
  }
}
