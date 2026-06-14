import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { isComplimentaryTenant } from "@/lib/complimentary-access";
import {
  resolveSubscriptionAccess,
  subscriptionRequiredApiResponse,
} from "@/lib/subscription-access-core";
import {
  getApiResponseCache,
  setApiResponseCache,
} from "@/lib/api-response-cache";

export {
  resolveSubscriptionAccess,
  isTrialActive,
  SUBSCRIPTION_STATES,
  SUBSCRIPTION_ALLOWED_API_PREFIXES,
  SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
  isSubscriptionBypassPath,
  subscriptionRequiredApiResponse,
} from "@/lib/subscription-access-core";

export async function fetchStripeSubscriptionStatus(tenantDbId, fallbackUserId = "") {
  const primaryId = String(tenantDbId || "").trim();
  const fallbackId = String(fallbackUserId || "").trim();
  const ids = [...new Set([primaryId, fallbackId].filter(Boolean))];

  for (const id of ids) {
    const { data, error } = await supabaseAdmin
      .from("contractor_subscriptions")
      .select("status")
      .eq("tenant_id", id)
      .in("status", ["trialing", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[subscription-access] fetchStripeSubscriptionStatus", error.message);
      continue;
    }

    if (data?.status) {
      return String(data.status).toLowerCase();
    }
  }

  return null;
}

/**
 * Backup path when webhooks lag: if DB shows no access, pull live Stripe subscription,
 * upsert contractor_subscriptions, and repair auth metadata. Cached briefly per user.
 */
export async function ensurePaidAccessFromStripe(context = {}) {
  const tenantDbId = String(context.tenantDbId || "").trim();
  const userId = String(context.userId || "").trim();
  const email = String(context.email || "").trim();
  const role = context.role;
  const trialEndDate = context.trialEndDate || null;
  const complimentaryAccess = context.complimentaryAccess === true;

  let stripeSubscriptionStatus = await fetchStripeSubscriptionStatus(
    tenantDbId,
    userId,
  );

  let access = resolveSubscriptionAccess({
    role,
    isSubscribed: context.isSubscribed === true,
    trialEndDate,
    complimentaryAccess,
    stripeSubscriptionStatus,
  });

  if (access.hasBusinessAccess) {
    return {
      access,
      stripeSubscriptionStatus: stripeSubscriptionStatus || "",
      isSubscribed: true,
      reconciled: false,
    };
  }

  const cacheKey = `stripe_reconcile:${userId || tenantDbId}`;
  const recentlyReconciled = await getApiResponseCache(cacheKey);
  if (recentlyReconciled) {
    return {
      access,
      stripeSubscriptionStatus: stripeSubscriptionStatus || "",
      isSubscribed: false,
      reconciled: false,
    };
  }

  try {
    console.log("[subscription-access] Stripe backup reconcile start", {
      tenantDbId,
      userId,
    });
    const { reconcileTenantSubscriptionFromStripe } = await import(
      "@/lib/subscription-stripe-sync"
    );
    const result = await reconcileTenantSubscriptionFromStripe({
      tenantDbId,
      userId,
      email,
    });
    await setApiResponseCache(cacheKey, true, STRIPE_RECONCILE_CACHE_TTL_SECONDS);

    if (result.activated) {
      stripeSubscriptionStatus = result.stripeSubscriptionStatus || "active";
      access = resolveSubscriptionAccess({
        role,
        isSubscribed: true,
        trialEndDate,
        complimentaryAccess,
        stripeSubscriptionStatus,
      });
      console.log("[subscription-access] Stripe backup reconcile SUCCESS", {
        tenantDbId,
        userId,
        hasBusinessAccess: access.hasBusinessAccess,
      });
      return {
        access,
        stripeSubscriptionStatus,
        isSubscribed: true,
        reconciled: true,
      };
    }

    console.warn("[subscription-access] Stripe backup reconcile no activation", {
      tenantDbId,
      userId,
      reason: result.reason || null,
    });
  } catch (error) {
    console.warn(
      "[subscription-access] Stripe backup reconcile failed",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    access,
    stripeSubscriptionStatus: stripeSubscriptionStatus || "",
    isSubscribed: false,
    reconciled: false,
  };
}

/** Load live Stripe subscription from DB and repair auth metadata when paid. */
export async function hydrateSessionSubscriptionFields({
  tenantDbId,
  userId,
  userMetadata = {},
} = {}) {
  const stripeSubscriptionStatus = await fetchStripeSubscriptionStatus(tenantDbId, userId);
  const active =
    stripeSubscriptionStatus === "active" || stripeSubscriptionStatus === "trialing";

  if (active && userId) {
    const meta = userMetadata && typeof userMetadata === "object" ? userMetadata : {};
    if (meta.isSubscribed !== true || String(meta.status || "").toLowerCase() !== "active") {
      try {
        await syncUserSubscriptionMetadata({
          userId,
          isSubscribed: true,
          status: "active",
        });
        console.log("[subscription-access] repaired user metadata to ACTIVE", userId);
      } catch (repairError) {
        console.warn(
          "[subscription-access] metadata repair failed",
          repairError instanceof Error ? repairError.message : repairError,
        );
      }
    }
  }

  return {
    stripeSubscriptionStatus: stripeSubscriptionStatus || "",
    isSubscribed: active || userMetadata?.isSubscribed === true,
  };
}

export async function resolveTenantSubscriptionAccess(context = {}) {
  const complimentaryAccess =
    context.complimentaryAccess === true ||
    isComplimentaryTenant(context.tenantDbId);

  let stripeSubscriptionStatus = context.stripeSubscriptionStatus || null;
  if (!stripeSubscriptionStatus && context.tenantDbId) {
    stripeSubscriptionStatus = await fetchStripeSubscriptionStatus(
      context.tenantDbId,
      context.userId,
    );
  }

  return resolveSubscriptionAccess({
    role: context.role,
    isSubscribed: context.isSubscribed === true,
    trialEndDate: context.trialEndDate || null,
    complimentaryAccess,
    stripeSubscriptionStatus,
  });
}

export function subscriptionRequiredResponse() {
  const payload = subscriptionRequiredApiResponse();
  return new Response(JSON.stringify(payload.body), {
    status: payload.status,
    headers: {
      "Content-Type": "application/json",
      ...payload.headers,
    },
  });
}

export async function requireBusinessAccess(context) {
  const access = await resolveTenantSubscriptionAccess(context);
  if (access.hasBusinessAccess) {
    return { access, blocked: null };
  }
  return { access, blocked: subscriptionRequiredResponse() };
}

export async function syncUserSubscriptionMetadata({
  userId,
  isSubscribed,
  status,
}) {
  const id = String(userId || "").trim();
  if (!id) return;

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: userData } = await admin.auth.admin.getUserById(id);
  const currentMeta = userData?.user?.user_metadata || {};

  const { error } = await admin.auth.admin.updateUserById(id, {
    user_metadata: {
      ...currentMeta,
      isSubscribed: Boolean(isSubscribed),
      status: status || (isSubscribed ? "active" : "expired"),
    },
  });

  if (error) {
    console.error("[subscription-access] syncUserSubscriptionMetadata failed", error.message);
    throw new Error(error.message || "Unable to sync subscription metadata");
  }
}
