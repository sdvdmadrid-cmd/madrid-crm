import "server-only";
import { getStripeServerClient } from "@/lib/stripe-payments";
import {
  CONNECT_ERROR_CODE,
  PAYMENTS_MODE,
} from "@/lib/stripe-connect-codes";
import {
  readConnectProfile,
  writeConnectProfile,
} from "@/lib/stripe-connect-storage";

/**
 * Stripe Connect (Express) — deployment-ready scaffold.
 * Keep STRIPE_CONNECT_ENABLED=false until Illinois EIN, business banking, and Stripe
 * platform Connect verification are complete. No fake activation states in code.
 */
export function isStripeConnectEnabled() {
  return String(process.env.STRIPE_CONNECT_ENABLED || "").trim() === "true";
}

/** @returns {'platform' | 'connect'} */
export function getStripePaymentsMode() {
  return isStripeConnectEnabled() ? PAYMENTS_MODE.CONNECT : PAYMENTS_MODE.PLATFORM;
}

export const STRIPE_CONNECT_PLATFORM_ERROR_CODE =
  CONNECT_ERROR_CODE.PLATFORM_NOT_ENABLED;
export const CONNECT_PAYOUT_REQUIRED_CODE = CONNECT_ERROR_CODE.PAYOUT_REQUIRED;

export function isStripeConnectPlatformNotEnabledError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("STRIPE_CONNECT_PLATFORM_NOT_ENABLED") ||
    message.includes("signed up for Connect") ||
    message.includes("dashboard.stripe.com/connect")
  );
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

  const paymentsMode = getStripePaymentsMode();
  const checkoutRequiresConnect = paymentsMode === PAYMENTS_MODE.CONNECT;

  return {
    enabled: checkoutRequiresConnect,
    paymentsMode,
    checkoutRequiresConnect,
    configured: Boolean(connect.accountId),
    accountId: connect.accountId,
    chargesEnabled: connect.chargesEnabled,
    payoutsEnabled: connect.payoutsEnabled,
    onboardedAt: connect.onboardedAt,
    onboarded: connect.onboarded,
    /** True only when Stripe webhooks report charges + payouts (never from env alone). */
    activationSource: "stripe_account_capabilities",
  };
}

/** JSON error body for Connect API routes. */
export function buildConnectRouteErrorPayload(error, fallbackStatus = 500) {
  if (isStripeConnectPlatformNotEnabledError(error)) {
    return {
      status: 503,
      body: {
        success: false,
        code: CONNECT_ERROR_CODE.PLATFORM_NOT_ENABLED,
        error:
          "Stripe Connect is not enabled on the FieldBase platform Stripe account yet.",
      },
    };
  }

  const code = String(error?.code || "").trim();
  return {
    status: fallbackStatus,
    body: {
      success: false,
      ...(code ? { code } : {}),
      error: String(error?.message || "Connect request failed"),
    },
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
      if (isStripeConnectPlatformNotEnabledError(error)) {
        const platformError = new Error(
          "STRIPE_CONNECT_PLATFORM_NOT_ENABLED: FieldBase must enable Stripe Connect on the platform Stripe account first. Open https://dashboard.stripe.com/connect and complete platform signup, then try again.",
        );
        platformError.code = STRIPE_CONNECT_PLATFORM_ERROR_CODE;
        throw platformError;
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
