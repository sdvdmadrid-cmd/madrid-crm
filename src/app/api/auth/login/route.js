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
  resolveProfileForUser,
} from "@/lib/supabase-auth";

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

    const profile = await resolveProfileForUser(data.user, {
      tenantId: data.user.id,
      role: data.user.app_metadata?.role,
    });

    const sessionUser = buildAppSessionFromSupabaseUser(
      data.user,
      data.session,
      profile,
    );

    const token = createSessionToken(sessionUser);

    return new Response(JSON.stringify({ success: true, data: sessionUser }), {
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
