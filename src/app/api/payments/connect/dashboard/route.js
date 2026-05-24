import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  createConnectDashboardLink,
  isStripeConnectEnabled,
} from "@/lib/stripe-connect";
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
          error: "Stripe Connect is not enabled yet.",
          code: "connect_not_enabled",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await createConnectDashboardLink(context.tenantDbId);
    if (!result?.url) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Connect a Stripe account before opening the dashboard.",
          code: "connect_not_configured",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: { url: result.url } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/payments/connect/dashboard] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
