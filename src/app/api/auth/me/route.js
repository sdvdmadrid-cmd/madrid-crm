import { getTenantContext } from "@/lib/tenant";
import { cookies } from "next/headers";
import { buildSessionCookie, createSessionToken, getSessionFromRequest } from "@/lib/auth";
import { isLogoutGuardCookieSet } from "@/lib/auth-logout-guard.js";
import { getRoleCapabilities, normalizeAppRole } from "@/lib/access-control";
import { enrichAuthMeData, authReconcileCacheKey, AUTH_RECONCILE_CACHE_TTL_SECONDS } from "@/lib/auth-me-workspace";
import {
  ensurePaidAccessFromStripe,
  fetchStripeSubscriptionStatus,
  hydrateSessionSubscriptionFields,
  resolveSubscriptionAccess,
} from "@/lib/subscription-access";
import {
  getApiResponseCache,
  setApiResponseCache,
} from "@/lib/api-response-cache";
import {
  buildAppSessionFromSupabaseUser,
  reconcileUserRoleOnLogin,
  resolveProfileForUser,
} from "@/lib/supabase-auth";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-ssr";

const AUTH_DEBUG = process.env.NEXT_PUBLIC_AUTH_DEBUG === "1";

async function attachSubscriptionAccessFields(base = {}) {
  let stripeSubscriptionStatus = await fetchStripeSubscriptionStatus(
    base.tenantDbId,
    base.userId,
  );
  let access = resolveSubscriptionAccess({
    role: base.role,
    isSubscribed: base.isSubscribed === true,
    trialEndDate: base.trialEndDate || null,
    complimentaryAccess: base.complimentaryAccess === true,
    stripeSubscriptionStatus,
  });

  if (!access.hasBusinessAccess && base.role !== "super_admin") {
    const ensured = await ensurePaidAccessFromStripe({
      tenantDbId: base.tenantDbId,
      userId: base.userId,
      email: base.email,
      role: base.role,
      isSubscribed: base.isSubscribed === true,
      trialEndDate: base.trialEndDate || null,
      complimentaryAccess: base.complimentaryAccess === true,
    });
    if (ensured.reconciled && ensured.access.hasBusinessAccess) {
      stripeSubscriptionStatus = ensured.stripeSubscriptionStatus;
      access = ensured.access;
    }
  }

  return {
    ...base,
    stripeSubscriptionStatus,
    isSubscribed: access.hasBusinessAccess
      ? true
      : base.isSubscribed === true,
    hasBusinessAccess: access.hasBusinessAccess,
    subscriptionState: access.state,
  };
}

async function buildAuthMePayload(base = {}) {
  try {
    console.log("[api/auth/me] SUBSCRIPTION CHECK START", base.userId || "");
    const withAccess = await attachSubscriptionAccessFields(base);
    console.log("[api/auth/me] SUBSCRIPTION CHECK SUCCESS", {
      userId: withAccess.userId || null,
      hasBusinessAccess: withAccess.hasBusinessAccess,
      stripeSubscriptionStatus: withAccess.stripeSubscriptionStatus || null,
    });
    const enriched = await enrichAuthMeData(withAccess);
    console.log("[api/auth/me] PROFILE FETCH SUCCESS", base.userId || "");
    return enriched;
  } catch (error) {
    console.error("[api/auth/me] buildAuthMePayload degraded", error);
    const fallback = await attachSubscriptionAccessFields(base).catch(() => base);
    return {
      ...fallback,
      capabilities:
        fallback.capabilities || getRoleCapabilities(normalizeAppRole(base.role)),
    };
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
    }),
  ]);
}

export async function GET(request) {
  try {
    console.log("[api/auth/me] AUTH START");
    if (AUTH_DEBUG) {
      console.info("[api/auth/me] entry", {
        pathname: new URL(request.url).pathname,
        cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
      });
    }

    const session = getTenantContext(request);
    const appSession = getSessionFromRequest(request);

    if (!session?.authenticated) {
      if (isLogoutGuardCookieSet(request)) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthenticated" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const cookieStore = await cookies();
      const supabase = createSupabaseRouteHandlerClient(cookieStore);
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      console.info("[dashboard-protection][api/auth/me] fallback auth", {
        hasUser: Boolean(user),
        userId: user?.id || null,
        emailConfirmedAt: user?.email_confirmed_at || null,
        error: error?.message || null,
      });

      if (error || !user || !user.email_confirmed_at) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthenticated" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const profile = await resolveProfileForUser(user, {
        tenantId: user.id,
        role: user.app_metadata?.role,
      });

      const stripeSubscriptionStatus = await fetchStripeSubscriptionStatus(profile?.tenantId || user.id);
      const appSession = buildAppSessionFromSupabaseUser(user, null, profile, {
        stripeSubscriptionStatus,
      });
      const token = createSessionToken(appSession);

        return new Response(
          JSON.stringify({
            success: true,
            data: await buildAuthMePayload({
              userId: appSession.userId,
              tenantId: appSession.tenantId,
              tenantDbId: appSession.tenantDbId,
              email: appSession.email,
              name: appSession.name,
              companyName: appSession.companyName || "",
              role: appSession.role,
              capabilities: getRoleCapabilities(normalizeAppRole(appSession.role)),
              businessType: appSession.businessType || appSession.industry || "",
              industry: appSession.businessType || appSession.industry || "",
              isSubscribed: appSession.isSubscribed === true,
              trialEndDate: appSession.trialEndDate || null,
              complimentaryAccess: appSession.complimentaryAccess === true,
            }),
          }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildSessionCookie(token),
          },
        },
      );
    }

    if (AUTH_DEBUG) {
      console.info("[api/auth/me] existing app session", {
        userId: session.userId,
        role: session.role,
      });
    }

    let responseBody = {
      userId: session.userId,
      tenantId: session.tenantId,
      tenantDbId: session.tenantDbId,
      email: session.email,
      name: session.name,
      companyName: session.companyName || "",
      role: session.role,
      capabilities: session.capabilities,
      businessType: session.businessType || session.industry || "",
      industry: session.businessType || session.industry || "",
      isSubscribed: session.isSubscribed === true,
      trialEndDate: session.trialEndDate || null,
      complimentaryAccess: session.complimentaryAccess === true,
    };

    let setCookieHeader = null;

    if (
      appSession?.devProfile &&
      String(appSession.devProfile).toLowerCase() !== "super_admin"
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          data: await buildAuthMePayload(responseBody),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=30",
          },
        },
      );
    }

    let stripeSubscriptionStatus = await fetchStripeSubscriptionStatus(
      responseBody.tenantDbId,
      responseBody.userId,
    );
    await hydrateSessionSubscriptionFields({
      tenantDbId: responseBody.tenantDbId,
      userId: responseBody.userId,
      userMetadata: {
        isSubscribed: responseBody.isSubscribed,
        status: session?.status,
      },
    }).catch(() => {});

    let subscriptionAccess = resolveSubscriptionAccess({
      ...responseBody,
      stripeSubscriptionStatus,
    });

    if (!subscriptionAccess.hasBusinessAccess && responseBody.role !== "super_admin") {
      const ensured = await ensurePaidAccessFromStripe({
        tenantDbId: responseBody.tenantDbId,
        userId: responseBody.userId,
        email: responseBody.email,
        role: responseBody.role,
        isSubscribed: responseBody.isSubscribed === true,
        trialEndDate: responseBody.trialEndDate || null,
        complimentaryAccess: responseBody.complimentaryAccess === true,
      });
      if (ensured.reconciled && ensured.access.hasBusinessAccess) {
        subscriptionAccess = ensured.access;
        stripeSubscriptionStatus = ensured.stripeSubscriptionStatus;
      }
    }

    const paidOrStripeActive =
      stripeSubscriptionStatus === "active" || stripeSubscriptionStatus === "trialing";
    const effectiveIsSubscribed =
      responseBody.isSubscribed === true || paidOrStripeActive;
    responseBody = {
      ...responseBody,
      stripeSubscriptionStatus,
      isSubscribed: effectiveIsSubscribed,
      hasBusinessAccess: subscriptionAccess.hasBusinessAccess,
      subscriptionState: subscriptionAccess.state,
    };

    const sessionNeedsRefresh =
      !appSession ||
      appSession?.hasBusinessAccess !== subscriptionAccess.hasBusinessAccess ||
      appSession?.isSubscribed !== effectiveIsSubscribed ||
      appSession?.stripeSubscriptionStatus !== stripeSubscriptionStatus ||
      (subscriptionAccess.hasBusinessAccess && !appSession?.hasBusinessAccess);

    if (sessionNeedsRefresh) {
      const token = createSessionToken({
        ...(appSession || {
          userId: responseBody.userId,
          tenantId: responseBody.tenantId,
          tenantDbId: responseBody.tenantDbId,
          email: responseBody.email,
          name: responseBody.name,
          companyName: responseBody.companyName,
          role: responseBody.role,
          businessType: responseBody.businessType,
          industry: responseBody.industry,
          trialEndDate: responseBody.trialEndDate,
          complimentaryAccess: responseBody.complimentaryAccess,
        }),
        isSubscribed: effectiveIsSubscribed,
        stripeSubscriptionStatus,
        hasBusinessAccess: subscriptionAccess.hasBusinessAccess,
        subscriptionState: subscriptionAccess.state,
      });
      setCookieHeader = buildSessionCookie(token);
    }

    const reconcileKey = authReconcileCacheKey(session.userId);
    const recentlyReconciled = await getApiResponseCache(reconcileKey);

    if (!recentlyReconciled) {
      try {
        await withTimeout(
          (async () => {
            const cookieStore = await cookies();
            const supabase = createSupabaseRouteHandlerClient(cookieStore);
            const {
              data: { user },
            } = await supabase.auth.getUser();

            if (user?.id) {
              const reconciled = await reconcileUserRoleOnLogin(user);
              const profile = await resolveProfileForUser(reconciled, {
                tenantId: session.tenantDbId || reconciled.id,
                role: session.role,
              });
              const refreshedStripeStatus = await fetchStripeSubscriptionStatus(
                session.tenantDbId || reconciled.id,
              );
              const refreshedSession = buildAppSessionFromSupabaseUser(
                reconciled,
                null,
                profile,
                { stripeSubscriptionStatus: refreshedStripeStatus },
              );
              const roleChanged = refreshedSession.role !== session.role;
              const accessChanged =
                refreshedSession.hasBusinessAccess !== appSession?.hasBusinessAccess ||
                refreshedSession.isSubscribed !== appSession?.isSubscribed;

              if (roleChanged || accessChanged) {
                const token = createSessionToken(refreshedSession);
                setCookieHeader = buildSessionCookie(token);
                responseBody = {
                  userId: refreshedSession.userId,
                  tenantId: refreshedSession.tenantId,
                  tenantDbId: refreshedSession.tenantDbId,
                  email: refreshedSession.email,
                  name: refreshedSession.name,
                  companyName: refreshedSession.companyName || "",
                  role: refreshedSession.role,
                  capabilities: getRoleCapabilities(
                    normalizeAppRole(refreshedSession.role),
                  ),
                  businessType: refreshedSession.businessType || "",
                  industry: refreshedSession.businessType || "",
                  isSubscribed: refreshedSession.isSubscribed === true,
                  trialEndDate: refreshedSession.trialEndDate || null,
                  complimentaryAccess: refreshedSession.complimentaryAccess === true,
                  stripeSubscriptionStatus: refreshedStripeStatus,
                  hasBusinessAccess: refreshedSession.hasBusinessAccess,
                  subscriptionState: refreshedSession.subscriptionState,
                };
              }
            }
          })(),
          5000,
          "auth_reconcile",
        );
      } catch (reconcileError) {
        console.warn(
          "[api/auth/me] reconcile skipped",
          reconcileError instanceof Error ? reconcileError.message : reconcileError,
        );
      }

      await setApiResponseCache(reconcileKey, true, AUTH_RECONCILE_CACHE_TTL_SECONDS);
    }

    console.log("[api/auth/me] SESSION FOUND", Boolean(responseBody.userId));

    return new Response(
      JSON.stringify({
        success: true,
        data: await buildAuthMePayload(responseBody),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=30",
          ...(setCookieHeader ? { "Set-Cookie": setCookieHeader } : {}),
        },
      },
    );
  } catch (error) {
    console.error("[api/auth/me] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unable to load session",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
