import {
  checkPasswordResetRateLimit as checkPasswordResetRateLimitDefault,
  getRequestIp,
  recordPasswordResetAttempt as recordPasswordResetAttemptDefault,
} from "@/lib/rate-limit";
import {
  generatePasswordRecoveryLink as generatePasswordRecoveryLinkDefault,
  getRequestOrigin as getRequestOriginDefault,
  sendPasswordRecoveryEmailViaSupabase as sendPasswordRecoveryEmailViaSupabaseDefault,
} from "@/lib/supabase-auth";
import {
  logEmailAttempt as logEmailAttemptDefault,
  sendEmail as sendEmailDefault,
} from "@/lib/email";
import { isTestEmailDomain as isTestEmailDomainDefault } from "@/lib/production-config";

const PASSWORD_RESET_EVENT_TYPE = "password_reset";

export function isResendUsable(env = process.env, isTestEmailDomain = isTestEmailDomainDefault) {
  const emailProvider = String(env.EMAIL_PROVIDER || "mock").trim().toLowerCase();
  const emailFrom = String(env.EMAIL_FROM || "").trim();
  const resendApiKey = String(env.RESEND_API_KEY || "").trim();

  if (emailProvider !== "resend") return false;
  if (!resendApiKey) return false;
  if (env.NODE_ENV === "production" && isTestEmailDomain(emailFrom)) return false;
  return true;
}

function createJsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function createGenericResponse() {
  return createJsonResponse({
    success: true,
    message:
      "If an account exists for this email, a password reset link has been sent.",
  });
}

function createDeliveryFailureResponse() {
  return createJsonResponse(
    {
      success: false,
      error:
        "Unable to send a password reset email right now. Please try again shortly.",
      code: "EMAIL_DELIVERY_FAILED",
    },
    503,
  );
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getAppUrl(env = process.env) {
  return String(env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function getSuperAdminEmail(env = process.env) {
  return String(env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
}

function normalizeResetTenantId(user) {
  return String(
    user?.app_metadata?.tenant_id ||
      user?.app_metadata?.tenantId ||
      user?.user_metadata?.tenant_id ||
      user?.user_metadata?.tenantId ||
      "auth",
  )
    .trim()
    .toLowerCase();
}

async function logPasswordResetEmailAttempt({
  deps,
  email,
  result,
  user = null,
  provider,
  success,
  error = null,
}) {
  try {
    await deps.logEmailAttempt({
      tenantId: normalizeResetTenantId(user),
      userId: user?.id || null,
      recipient: email,
      provider: result?.provider || provider || "unknown",
      providerMessageId: result?.providerMessageId || null,
      success,
      error,
      eventType: PASSWORD_RESET_EVENT_TYPE,
    });
  } catch (logError) {
    console.error("[api/auth/forgot-password] failed to log email attempt", {
      provider: result?.provider || provider || "unknown",
      email,
      error: logError?.message || "unknown",
    });
  }
}

export function buildResetEmailHtml(resetUrl) {
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
              If you didn't request a password reset, you can safely ignore this email - your password won't change.
            </p>
            <p style="margin:0;font-size:12px;color:#d1d5db;word-break:break-all;">
              Or copy this link: ${resetUrl}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} FieldBase. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const defaultDeps = {
  env: process.env,
  checkPasswordResetRateLimit: checkPasswordResetRateLimitDefault,
  recordPasswordResetAttempt: recordPasswordResetAttemptDefault,
  getRequestIp,
  getRequestOrigin: getRequestOriginDefault,
  generatePasswordRecoveryLink: generatePasswordRecoveryLinkDefault,
  sendPasswordRecoveryEmailViaSupabase:
    sendPasswordRecoveryEmailViaSupabaseDefault,
  sendEmail: sendEmailDefault,
  logEmailAttempt: logEmailAttemptDefault,
  isTestEmailDomain: isTestEmailDomainDefault,
};

export async function handleForgotPassword(request, deps = defaultDeps) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const env = deps.env || process.env;
    const superAdminEmail = getSuperAdminEmail(env);
    const isSuperAdminRequest = Boolean(superAdminEmail) && email === superAdminEmail;
    const ip = deps.getRequestIp(request);

    if (!isValidEmail(email)) {
      return createGenericResponse();
    }

    const limitState = await deps.checkPasswordResetRateLimit({ email, ip });
    if (!limitState.allowed) {
      return createJsonResponse(
        {
          success: false,
          error: "Too many attempts. Please try again shortly.",
          code: "RATE_LIMITED",
          retryAfterSeconds: limitState.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(limitState.retryAfterSeconds) },
      );
    }

    await deps.recordPasswordResetAttempt({ email, ip });

    const origin = deps.getRequestOrigin(request) || getAppUrl(env);

    if (isSuperAdminRequest) {
      try {
        const debugLink = await deps.generatePasswordRecoveryLink({ email, origin });
        return createJsonResponse({
          success: true,
          message: "Admin direct reset link generated.",
          delivery: "manual_link",
          resetUrl: debugLink.resetUrl,
        });
      } catch (adminErr) {
        console.error("[api/auth/forgot-password] admin link generation failed", {
          error: adminErr?.message || "unknown",
        });
        return createGenericResponse();
      }
    }

    if (isResendUsable(env, deps.isTestEmailDomain)) {
      try {
        const result = await deps.generatePasswordRecoveryLink({ email, origin });
        const resetUrl = result.resetUrl;

        const emailResult = await deps.sendEmail({
          to: email,
          subject: "Reset your FieldBase password",
          html: buildResetEmailHtml(resetUrl),
          text: `Reset your FieldBase password

Click this link to reset your password (expires in 1 hour):
${resetUrl}

If you didn't request this, ignore this email.`,
          metadata: {
            tenantId: normalizeResetTenantId(result.user),
            eventType: PASSWORD_RESET_EVENT_TYPE,
          },
        });

        await logPasswordResetEmailAttempt({
          deps,
          email,
          result: emailResult,
          user: result.user,
          success: emailResult?.success === true,
          error: emailResult?.error || null,
        });

        if (emailResult?.success) {
          return createGenericResponse();
        }

        console.error("[api/auth/forgot-password] Resend delivery failed", {
          provider: emailResult?.provider,
          error: emailResult?.error,
        });
      } catch (resendErr) {
        console.error("[api/auth/forgot-password] Resend flow error", {
          error: resendErr?.message || "unknown",
        });
      }
    }

    try {
      await deps.sendPasswordRecoveryEmailViaSupabase({ email, origin });
      await logPasswordResetEmailAttempt({
        deps,
        email,
        result: { success: true, provider: "supabase" },
        provider: "supabase",
        success: true,
      });
      return createGenericResponse();
    } catch (supabaseErr) {
      console.error("[api/auth/forgot-password] Supabase email failed", {
        error: supabaseErr?.message || "unknown",
      });
      await logPasswordResetEmailAttempt({
        deps,
        email,
        result: { success: false, provider: "supabase" },
        provider: "supabase",
        success: false,
        error: supabaseErr?.message || "unknown",
      });
    }

    return createDeliveryFailureResponse();
  } catch (error) {
    console.error("[api/auth/forgot-password] unhandled error", {
      error: error?.message || "unknown",
    });
    return createDeliveryFailureResponse();
  }
}

export async function POST(request) {
  return handleForgotPassword(request);
}
