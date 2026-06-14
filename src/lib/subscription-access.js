import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { isComplimentaryTenant } from "@/lib/complimentary-access";
import {
  resolveSubscriptionAccess,
  subscriptionRequiredApiResponse,
} from "@/lib/subscription-access-core";

export {
  resolveSubscriptionAccess,
  isTrialActive,
  SUBSCRIPTION_STATES,
  SUBSCRIPTION_ALLOWED_API_PREFIXES,
  SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
  isSubscriptionBypassPath,
  subscriptionRequiredApiResponse,
} from "@/lib/subscription-access-core";

export async function fetchStripeSubscriptionStatus(tenantDbId) {
  const id = String(tenantDbId || "").trim();
  if (!id) return null;

  const { data, error } = await supabaseAdmin
    .from("contractor_subscriptions")
    .select("status")
    .eq("tenant_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[subscription-access] fetchStripeSubscriptionStatus", error.message);
    return null;
  }

  return data?.status ? String(data.status).toLowerCase() : null;
}

export async function resolveTenantSubscriptionAccess(context = {}) {
  const complimentaryAccess =
    context.complimentaryAccess === true ||
    isComplimentaryTenant(context.tenantDbId);

  let stripeSubscriptionStatus = context.stripeSubscriptionStatus || null;
  if (!stripeSubscriptionStatus && context.tenantDbId) {
    stripeSubscriptionStatus = await fetchStripeSubscriptionStatus(context.tenantDbId);
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

  await admin.auth.admin.updateUserById(id, {
    user_metadata: {
      ...currentMeta,
      isSubscribed: Boolean(isSubscribed),
      status: status || (isSubscribed ? "active" : "expired"),
    },
  });
}
