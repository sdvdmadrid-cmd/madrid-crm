import { getRequestOrigin } from "@/lib/supabase-auth";
import { getConnectStatusForTenant } from "@/lib/stripe-connect";
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

  const connectRequired = Boolean(connect.enabled);
  const cardPaymentsReady =
    ready && (!connectRequired || connect.onboarded);

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
        webhookEndpointUrl,
        connect,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
