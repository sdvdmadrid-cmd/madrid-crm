import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  buildConnectRouteErrorPayload,
  createConnectDashboardLink,
  isStripeConnectEnabled,
} from "@/lib/stripe-connect";
import { CONNECT_ERROR_CODE } from "@/lib/stripe-connect-codes";
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
          code: CONNECT_ERROR_CODE.NOT_ENABLED,
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
          code: CONNECT_ERROR_CODE.NOT_CONFIGURED,
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
    const { status, body } = buildConnectRouteErrorPayload(error);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
