import { getRequestOrigin } from "@/lib/supabase-auth";
import {
  CONNECT_PAYOUT_REQUIRED_CODE,
  getConnectStatusForTenant,
  getStripePaymentsMode,
} from "@/lib/stripe-connect";
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "@/lib/stripe-payments";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(request) {
  const context = await getAuthenticatedTenantContext(request);
  if (!context.authenticated) {
    return unauthenticatedResponse();
  }
  if (!canManageSensitive(context.role)) {
    return forbiddenResponse();
  }

  const origin = String(getRequestOrigin(request) || "").replace(/\/$/, "");
  const publishableKeyConfigured = Boolean(
    String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim(),
  );
  const secretKeyConfigured = Boolean(getStripeSecretKey());
  const webhookSecretConfigured = Boolean(getStripeWebhookSecret());
  const appUrlConfigured = Boolean(origin);

  const webhookEndpointUrl = origin
    ? `${origin}/api/payments/webhooks/stripe`
    : "";

  const ready =
    publishableKeyConfigured &&
    secretKeyConfigured &&
    webhookSecretConfigured &&
    appUrlConfigured;

  let connect = {
    enabled: false,
    configured: false,
    onboarded: false,
    chargesEnabled: false,
    payoutsEnabled: false,
  };
  try {
    connect = await getConnectStatusForTenant(context.tenantDbId);
  } catch (error) {
    console.error("[api/invoices/payment-setup-status] connect status", error);
  }

  const paymentsMode = getStripePaymentsMode();
  const connectRequired = Boolean(connect.checkoutRequiresConnect);
  const cardPaymentsReady =
    ready && (!connectRequired || connect.onboarded);
  const cardPaymentsBlockReason =
    ready && connectRequired && !connect.onboarded
      ? CONNECT_PAYOUT_REQUIRED_CODE
      : null;

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        publishableKeyConfigured,
        secretKeyConfigured,
        webhookSecretConfigured,
        appUrlConfigured,
        ready,
        cardPaymentsReady,
        cardPaymentsBlockReason,
        paymentsMode,
        checkoutRequiresConnect: connectRequired,
        webhookEndpointUrl,
        connect,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
