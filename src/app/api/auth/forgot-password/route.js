import {
  checkPasswordResetRateLimit,
  getRequestIp,
  recordPasswordResetAttempt,
} from "@/lib/rate-limit";
import {
  getRequestOrigin,
  sendPasswordRecoveryEmailViaSupabase,
} from "@/lib/supabase-auth";

function createGenericResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      message:
        "If an account exists for this email, a password reset link has been sent.",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const ip = getRequestIp(request);

    if (!isValidEmail(email)) {
      return createGenericResponse();
    }

    const limitState = await checkPasswordResetRateLimit({ email, ip });
    if (!limitState.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Too many attempts. Please try again shortly.",
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

    await recordPasswordResetAttempt({ email, ip });

    const origin = getRequestOrigin(request);
    if (!origin) {
      throw new Error("Unable to resolve app origin for password recovery links");
    }
    // Fast path: send recovery email directly via Supabase Auth.
    // This avoids expensive user list scans and external provider delays.
    await sendPasswordRecoveryEmailViaSupabase({ email, origin });

    return createGenericResponse();
  } catch (error) {
    console.error("[api/auth/forgot-password] delivery failure", {
      error: error?.message || "unknown",
    });
    // Keep a generic success response to avoid user enumeration leaks.
    return createGenericResponse();
  }
}
