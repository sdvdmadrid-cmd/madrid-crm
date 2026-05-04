import {
  checkPasswordResetRateLimit,
  getRequestIp,
  recordPasswordResetAttempt,
} from "@/lib/rate-limit";
import {
  generatePasswordRecoveryLink,
  getRequestOrigin,
  sendPasswordRecoveryEmailViaSupabase,
} from "@/lib/supabase-auth";
import { sendEmail } from "@/lib/email";

const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || "resend")
  .trim()
  .toLowerCase();

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

function buildResetEmailHtml(resetUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#16a34a;padding:28px 40px;text-align:center;">
            <span style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">FieldBase</span>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 12px;font-size:22px;color:#111827;">Reset your password</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
              We received a request to reset the password for your FieldBase account.
              Click the button below to choose a new password. This link expires in 1 hour.
            </p>
            <div style="text-align:center;margin:0 0 28px;">
              <a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">
                Reset Password
              </a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
              If you didn't request a password reset, you can safely ignore this email — your password won't change.
            </p>
            <p style="margin:0;font-size:12px;color:#d1d5db;word-break:break-all;">
              Or copy this link: ${resetUrl}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} FieldBase. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

    const origin = getRequestOrigin(request) || APP_URL;

    // If custom provider is disabled, use Supabase native email directly.
    if (EMAIL_PROVIDER !== "resend") {
      try {
        await sendPasswordRecoveryEmailViaSupabase({ email, origin });
        return createGenericResponse();
      } catch (supabaseErr) {
        console.error("[api/auth/forgot-password] supabase direct failed", {
          error: supabaseErr?.message || "unknown",
          email,
          provider: EMAIL_PROVIDER,
        });
        return createGenericResponse();
      }
    }

    // Generate reset token via Supabase Admin API (no email sent by Supabase)
    // then send our own FieldBase-branded email via Resend.
    try {
      const result = await generatePasswordRecoveryLink({ email, origin });
      const resetUrl = result.resetUrl;

      const emailResult = await sendEmail({
        to: email,
        subject: "Reset your FieldBase password",
        html: buildResetEmailHtml(resetUrl),
        text: `Reset your FieldBase password\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
      });

      if (emailResult?.success) {
        return createGenericResponse();
      }

      console.error("[api/auth/forgot-password] sendEmail failed", {
        provider: emailResult?.provider,
        error: emailResult?.error,
        email,
      });
    } catch (linkErr) {
      console.error("[api/auth/forgot-password] custom flow failed", {
        error: linkErr?.message || "unknown",
        email,
      });
    }

    // Fallback path: ask Supabase to send the reset email directly.
    // This keeps reset functional even if custom delivery has transient issues.
    try {
      await sendPasswordRecoveryEmailViaSupabase({ email, origin });
      return createGenericResponse();
    } catch (fallbackErr) {
      console.error("[api/auth/forgot-password] supabase fallback failed", {
        error: fallbackErr?.message || "unknown",
        email,
      });
    }

    return createGenericResponse();
  } catch (error) {
    console.error("[api/auth/forgot-password] unhandled error", {
      error: error?.message || "unknown",
    });
    // Keep a generic success response to avoid user enumeration leaks.
    return createGenericResponse();
  }
}
