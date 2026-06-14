import { writeSecurityAudit } from "@/lib/security-audit";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * POST /api/client-errors
 * Best-effort client-side error reporting for production monitoring.
 */
export async function POST(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, userId  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const body = await request.json().catch(() => ({}));
    const message = String(body.message || "Client error").slice(0, 500);
    const stack = String(body.stack || "").slice(0, 1200);
    const url = String(body.url || "").slice(0, 500);
    const source = String(body.source || "window").slice(0, 80);

    await writeSecurityAudit({
      action: "client.error",
      userId: userId || "anonymous",
      tenantId: tenantDbId || "",
      metadata: { message, stack, url, source },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[api/client-errors][POST]", error);
    return Response.json({ success: false }, { status: 500 });
  }
}
