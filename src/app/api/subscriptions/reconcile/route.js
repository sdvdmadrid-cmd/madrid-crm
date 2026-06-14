import "server-only";

import { buildSessionCookie, createSessionToken, getSessionFromRequest } from "@/lib/auth";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { reconcileTenantSubscriptionFromStripe } from "@/lib/subscription-stripe-sync";
import { resolveSubscriptionAccess } from "@/lib/subscription-access";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers });
}

/**
 * POST /api/subscriptions/reconcile
 * Immediately sync Stripe → DB → session after checkout or when webhooks lag.
 */
export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const context = await getAuthenticatedTenantContext(request);
    if (!context.authenticated) return unauthenticatedResponse();
    if (!canWrite(context.role)) return forbiddenResponse();

    const result = await reconcileTenantSubscriptionFromStripe({
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      email: context.email,
    });

    const access = resolveSubscriptionAccess({
      role: context.role,
      isSubscribed: result.activated === true,
      trialEndDate: context.trialEndDate || null,
      complimentaryAccess: context.complimentaryAccess === true,
      stripeSubscriptionStatus: result.stripeSubscriptionStatus || "",
    });

    const appSession = getSessionFromRequest(request);
    let setCookie = null;

    if (appSession && access.hasBusinessAccess) {
      const token = createSessionToken({
        ...appSession,
        isSubscribed: true,
        stripeSubscriptionStatus: result.stripeSubscriptionStatus || "active",
        hasBusinessAccess: true,
        subscriptionState: access.state,
      });
      setCookie = buildSessionCookie(token);
    }

    return json(
      {
        success: true,
        data: {
          ...result,
          hasBusinessAccess: access.hasBusinessAccess,
          subscriptionState: access.state,
        },
      },
      200,
      setCookie ? { "Set-Cookie": setCookie } : {},
    );
  } catch (error) {
    console.error("[api/subscriptions/reconcile] error", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to reconcile subscription",
      },
      500,
    );
  }
}
