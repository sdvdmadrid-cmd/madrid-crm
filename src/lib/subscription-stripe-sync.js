import "server-only";

import { getStripeServerClient } from "@/lib/stripe-payments";
import { upsertContractorSubscriptionFromStripe } from "@/lib/stripe-webhook-processing";
import {
  fetchStripeSubscriptionStatus,
  resolveTenantSubscriptionAccess,
  syncUserSubscriptionMetadata,
} from "@/lib/subscription-access";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Pull live Stripe subscriptions for a tenant and upsert contractor_subscriptions + auth metadata.
 * Used after checkout and for owner/admin repair when webhooks lag or fail.
 */
export async function reconcileTenantSubscriptionFromStripe({
  tenantDbId,
  userId,
  email = "",
} = {}) {
  const tenantId = String(tenantDbId || "").trim();
  const resolvedUserId = String(userId || "").trim();
  if (!tenantId) {
    throw new Error("tenantDbId is required");
  }

  const existingStatus = await fetchStripeSubscriptionStatus(tenantId, resolvedUserId);
  if (existingStatus && ACTIVE_STATUSES.has(existingStatus)) {
    if (resolvedUserId) {
      await syncUserSubscriptionMetadata({
        userId: resolvedUserId,
        isSubscribed: true,
        status: "active",
      });
    }
    return {
      activated: true,
      source: "database",
      stripeSubscriptionStatus: existingStatus,
    };
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  let customerId = "";

  try {
    const search = await stripe.customers.search({
      query: `metadata['tenant_id']:'${tenantId}'`,
      limit: 1,
    });
    customerId = String(search?.data?.[0]?.id || "");
  } catch (searchError) {
    console.warn("[subscription-stripe-sync] customer search failed", searchError?.message);
  }

  if (!customerId && email) {
    const list = await stripe.customers.list({ email: String(email).trim().toLowerCase(), limit: 5 });
    const match = (list?.data || []).find(
      (customer) => String(customer?.metadata?.tenant_id || "") === tenantId,
    );
    customerId = String(match?.id || "");
  }

  if (!customerId) {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data: subRow } = await supabaseAdmin
      .from("contractor_subscriptions")
      .select("stripe_customer_id")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    customerId = String(subRow?.stripe_customer_id || "");
  }

  if (!customerId) {
    return { activated: false, source: "stripe", reason: "no_stripe_customer" };
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  const candidates = (subscriptions?.data || []).filter((sub) =>
    ACTIVE_STATUSES.has(String(sub?.status || "").toLowerCase()),
  );

  if (candidates.length === 0) {
    return { activated: false, source: "stripe", reason: "no_active_subscription" };
  }

  let lastResult = null;
  for (const subscription of candidates) {
    lastResult = await upsertContractorSubscriptionFromStripe(subscription);
  }

  const stripeSubscriptionStatus = await fetchStripeSubscriptionStatus(tenantId, resolvedUserId);
  const access = await resolveTenantSubscriptionAccess({
    tenantDbId: tenantId,
    userId: resolvedUserId,
    role: "owner",
    isSubscribed: ACTIVE_STATUSES.has(String(stripeSubscriptionStatus || "")),
  });

  return {
    activated: access.hasBusinessAccess,
    source: "stripe",
    stripeSubscriptionStatus: stripeSubscriptionStatus || "",
    hasBusinessAccess: access.hasBusinessAccess,
    subscriptionState: access.state,
    internalId: lastResult?.internalId || null,
  };
}
