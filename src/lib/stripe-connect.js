import "server-only";
import { getStripeServerClient } from "@/lib/stripe-payments";
import {
  readConnectProfile,
  writeConnectProfile,
} from "@/lib/stripe-connect-storage";

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
  return Math.min(Math.max(0, fee), Math.max(0, total - 1));
}

export async function getConnectStatusForTenant(tenantId) {
  const tenantKey = String(tenantId || "").trim();
  if (!tenantKey) {
    return { enabled: false, configured: false, onboarded: false };
  }

  const { connect } = await readConnectProfile(tenantKey);

  return {
    enabled: isStripeConnectEnabled(),
    configured: Boolean(connect.accountId),
    accountId: connect.accountId,
    chargesEnabled: connect.chargesEnabled,
    payoutsEnabled: connect.payoutsEnabled,
    onboardedAt: connect.onboardedAt,
    onboarded: connect.onboarded,
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
  const { connect, profile } = await readConnectProfile(tenantKey, {
    includeProfile: true,
  });

  let accountId = connect.accountId;

  if (!accountId) {
    let account;
    try {
      account = await stripe.accounts.create({
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
    } catch (error) {
      const message = String(error?.message || "");
      if (
        message.includes("signed up for Connect") ||
        message.includes("dashboard.stripe.com/connect")
      ) {
        throw new Error(
          "STRIPE_CONNECT_PLATFORM_NOT_ENABLED: FieldBase must enable Stripe Connect on the platform Stripe account first. Open https://dashboard.stripe.com/connect and complete platform signup, then try again.",
        );
      }
      throw error;
    }
    accountId = account.id;

    await writeConnectProfile(tenantKey, { accountId });
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
