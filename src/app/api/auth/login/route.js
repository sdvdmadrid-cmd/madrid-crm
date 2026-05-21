import { buildSessionCookie, createSessionToken } from "@/lib/auth";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  getRequestIp,
  recordFailedLoginAttempt,
} from "@/lib/rate-limit";
import {
  buildAppSessionFromSupabaseUser,
  createSupabaseServerAuthClient,
  findAuthUserByEmail,
  reconcileUserRoleOnLogin,
  resolveProfileForUser,
} from "@/lib/supabase-auth";
import { writeSecurityAudit } from "@/lib/security-audit";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").toString();
    const ip = getRequestIp(request);

    if (!email || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "email and password are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const limitState = await checkLoginRateLimit({ email, ip });
    if (!limitState.allowed) {
      await writeSecurityAudit({
        action: "auth.login.rate_limited",
        metadata: { email, ip, retryAfterSeconds: limitState.retryAfterSeconds },
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Too many login attempts. Please try again shortly.",
          code: "RATE_LIMITED",
          retryAfterSeconds: limitState.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(limitState.retryAfterSeconds),
          },
        },
      );
    }

    const authClient = createSupabaseServerAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user) {
      const authUser = await findAuthUserByEmail(email);
      if (authUser && !authUser.email_confirmed_at) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Please verify your email before logging in. Check your inbox.",
            code: "EMAIL_NOT_VERIFIED",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      await recordFailedLoginAttempt({ email, ip });
      await writeSecurityAudit({
        action: "auth.login.failed",
        userId: authUser?.id || "anonymous",
        tenantId:
          authUser?.app_metadata?.tenant_id ||
          authUser?.user_metadata?.tenant_id ||
          "",
        metadata: { email, ip },
      });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid credentials" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!data.user.email_confirmed_at) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Please verify your email before logging in. Check your inbox.",
          code: "EMAIL_NOT_VERIFIED",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    await clearLoginRateLimit({ email, ip });

    const reconciledUser = await reconcileUserRoleOnLogin(data.user);

    const profile = await resolveProfileForUser(reconciledUser, {
      tenantId: data.user.id,
      role: data.user.app_metadata?.role,
    });

    const sessionUser = buildAppSessionFromSupabaseUser(
      reconciledUser,
      data.session,
      profile,
    );

    const token = createSessionToken(sessionUser);
    const redirectTo =
      String(sessionUser.role || "").toLowerCase() === "super_admin"
        ? "/owner/overview"
        : "/dashboard";

    return new Response(
      JSON.stringify({ success: true, data: sessionUser, redirectTo }),
      {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": buildSessionCookie(token),
      },
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? String(error.message || "") : "";
    const isConstraintError =
      rawMessage.toLowerCase().includes("violates check constraint") ||
      rawMessage.toLowerCase().includes("profiles_role_check");

    return new Response(
      JSON.stringify({
        success: false,
        error: isConstraintError
          ? "Unable to sign in right now. Please try again in a moment."
          : rawMessage || "Unable to sign in right now.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
