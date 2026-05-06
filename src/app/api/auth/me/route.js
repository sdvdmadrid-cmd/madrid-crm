import { getTenantContext } from "@/lib/tenant";
import { cookies } from "next/headers";
import { buildSessionCookie, createSessionToken } from "@/lib/auth";
import { getRoleCapabilities, normalizeAppRole } from "@/lib/access-control";
import {
  buildAppSessionFromSupabaseUser,
  resolveProfileForUser,
} from "@/lib/supabase-auth";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-ssr";

const AUTH_DEBUG = process.env.NEXT_PUBLIC_AUTH_DEBUG === "1";

export async function GET(request) {
  try {
    if (AUTH_DEBUG) {
      console.info("[api/auth/me] entry", {
        pathname: new URL(request.url).pathname,
        cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
      });
    }

    const session = getTenantContext(request);

    if (!session?.authenticated) {
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

      const appSession = buildAppSessionFromSupabaseUser(user, null, profile);
      const token = createSessionToken(appSession);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
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
          },
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

    return new Response(
      JSON.stringify({
        success: true,
        data: {
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
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
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
