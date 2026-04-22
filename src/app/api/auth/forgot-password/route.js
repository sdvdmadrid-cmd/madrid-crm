import { sendEmail } from "@/lib/email";
import {
  checkPasswordResetRateLimit,
  getRequestIp,
  recordPasswordResetAttempt,
} from "@/lib/rate-limit";
import {
  findAuthUserByEmail,
  generatePasswordRecoveryLink,
  getRequestOrigin,
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

    const authUser = await findAuthUserByEmail(email);
    if (!authUser) {
      return createGenericResponse();
    }

    const origin = getRequestOrigin(request);
    if (!origin) {
      throw new Error("APP_URL must be configured for password recovery links");
    }
    const { resetUrl } = await generatePasswordRecoveryLink({ email, origin });

    const emailResult = await sendEmail({
      to: email,
      subject: "Reset your ContractorFlow password",
      html: `<p>Hi,</p><p>We received a request to reset your password.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link can only be used once and expires shortly.</p><p>If you did not request this, you can ignore this email.</p>`,
      text: `Hi,\n\nWe received a request to reset your password.\n\n${resetUrl}\n\nThis link can only be used once and expires shortly.\nIf you did not request this, you can ignore this email.`,
      metadata: {
        tenantId:
          authUser.app_metadata?.tenant_id ||
          authUser.app_metadata?.tenantId ||
          "default",
      },
    });

    if (!emailResult?.success) {
      console.error("Failed to send password reset email", {
        provider: emailResult?.provider || "unknown",
        error: emailResult?.error || "Unknown email provider error",
        email,
      });
      throw new Error("Password reset email delivery failed");
    }

    return createGenericResponse();
  } catch {
    // Keep a generic success response to avoid user enumeration leaks.
    return createGenericResponse();
  }
}
