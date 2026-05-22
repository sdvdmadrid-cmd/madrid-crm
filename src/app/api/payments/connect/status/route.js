import { getConnectStatusForTenant } from "@/lib/stripe-connect";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    if (!context.authenticated) {
      return unauthenticatedResponse();
    }
    if (!canManageSensitive(context.role)) {
      return forbiddenResponse();
    }

    const status = await getConnectStatusForTenant(context.tenantDbId);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...status,
          docs: "/docs/payments-architecture.md",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/payments/connect/status] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
