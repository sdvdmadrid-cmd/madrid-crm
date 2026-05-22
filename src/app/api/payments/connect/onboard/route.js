import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { createConnectOnboardingLink, isStripeConnectEnabled } from "@/lib/stripe-connect";
import { getRequestOrigin } from "@/lib/supabase-auth";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const context = await getAuthenticatedTenantContext(request);
    if (!context.authenticated) {
      return unauthenticatedResponse();
    }
    if (!canManageSensitive(context.role)) {
      return forbiddenResponse();
    }

    if (!isStripeConnectEnabled()) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Stripe Connect onboarding is not enabled yet. See docs/payments-architecture.md.",
          code: "connect_not_enabled",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const origin = String(getRequestOrigin(request) || "").replace(/\/$/, "");
    if (!origin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "APP_BASE_URL or APP_URL must be configured",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await createConnectOnboardingLink({
      tenantId: context.tenantDbId,
      returnUrl: `${origin}/invoices?connect=return`,
      refreshUrl: `${origin}/invoices?connect=refresh`,
    });

    if (!result?.url) {
      return new Response(
        JSON.stringify({ success: false, error: "Unable to create onboarding link" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { url: result.url, accountId: result.accountId },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/payments/connect/onboard] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
