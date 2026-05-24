import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStripeServerClient } from "@/lib/stripe-payments";

const COMPANY_PROFILES = "company_profiles";

/**
 * Stripe Connect (Express) — scaffold for Phase 1.
 * Enable with STRIPE_CONNECT_ENABLED=true after Connect is configured in Stripe Dashboard.
 */
export function isStripeConnectEnabled() {
  return String(process.env.STRIPE_CONNECT_ENABLED || "").trim() === "true";
}

/** Application fee in cents (destination charge). Default 0.75% + optional fixed. */
export function computePlatformFeeCents(amountCents) {
  const total = Math.max(0, Math.round(Number(amountCents) || 0));
  if (total <= 0) return 0;

  const bps = Math.max(0, Number(process.env.FIELDBASE_PLATFORM_FEE_BPS || 75));
  const fixed = Math.max(
    0,
    Number(process.env.FIELDBASE_PLATFORM_FEE_FIXED_CENTS || 0),
  );
  const fromPercent = Math.round((total * bps) / 10000);
  const fee = fromPercent + fixed;
  // Leave at least 1 cent for the connected account transfer.
  return Math.min(Math.max(0, fee), Math.max(0, total - 1));
}

export async function getConnectStatusForTenant(tenantId) {
  const tenantKey = String(tenantId || "").trim();
  if (!tenantKey) {
    return { enabled: false, configured: false, onboarded: false };
  }

  const { data, error } = await supabaseAdmin
    .from(COMPANY_PROFILES)
    .select(
      "stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_onboarded_at",
    )
    .eq("tenant_id", tenantKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const accountId = String(data?.stripe_connect_account_id || "").trim();
  return {
    enabled: isStripeConnectEnabled(),
    configured: Boolean(accountId),
    accountId,
    chargesEnabled: Boolean(data?.stripe_connect_charges_enabled),
    payoutsEnabled: Boolean(data?.stripe_connect_payouts_enabled),
    onboardedAt: data?.stripe_connect_onboarded_at || null,
    onboarded:
      Boolean(accountId) &&
      Boolean(data?.stripe_connect_charges_enabled) &&
      Boolean(data?.stripe_connect_payouts_enabled),
  };
}

/**
 * Creates Express account + Account Link when Connect is enabled.
 * Returns null when feature flag is off (callers should respond 503).
 */
export async function createConnectOnboardingLink({ tenantId, returnUrl, refreshUrl }) {
  if (!isStripeConnectEnabled()) {
    return null;
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  const tenantKey = String(tenantId || "").trim();
  const { data: profile } = await supabaseAdmin
    .from(COMPANY_PROFILES)
    .select("stripe_connect_account_id, public_display_name, company_name")
    .eq("tenant_id", tenantKey)
    .maybeSingle();

  let accountId = String(profile?.stripe_connect_account_id || "").trim();

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { tenant_id: tenantKey },
      business_profile: {
        name:
          String(profile?.public_display_name || profile?.company_name || "").trim() ||
          undefined,
      },
    });
    accountId = account.id;

    await supabaseAdmin
      .from(COMPANY_PROFILES)
      .upsert(
        {
          tenant_id: tenantKey,
          stripe_connect_account_id: accountId,
        },
        { onConflict: "tenant_id" },
      );
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });

  return { accountId, url: link.url };
}

/**
 * Stripe Express dashboard login link for an onboarded connected account.
 */
export async function createConnectDashboardLink(tenantId) {
  if (!isStripeConnectEnabled()) {
    return null;
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  const status = await getConnectStatusForTenant(tenantId);
  const accountId = String(status.accountId || "").trim();
  if (!accountId) {
    return null;
  }

  const link = await stripe.accounts.createLoginLink(accountId);
  return { url: link.url };
}
