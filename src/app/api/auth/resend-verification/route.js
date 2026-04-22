import { sendEmail } from "@/lib/email";
import {
  findAuthUserByEmail,
  generateSignupVerificationLink,
  getRequestOrigin,
  normalizeAuthUser,
} from "@/lib/supabase-auth";

// Generic success response to avoid leaking whether an email is registered
const OK = new Response(
  JSON.stringify({
    success: true,
    message: "If that email is registered and unverified, a new link was sent.",
  }),
  { status: 200, headers: { "Content-Type": "application/json" } },
);

export async function POST(request) {
  try {
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return OK;
    }

    const user = await findAuthUserByEmail(email);

    if (!user || user.email_confirmed_at) {
      return OK;
    }

    const origin = getRequestOrigin(request);
    if (!origin) {
      throw new Error("APP_URL must be configured for verification links");
    }
    const { verifyUrl } = await generateSignupVerificationLink({
      email,
      origin,
    });
    const normalized = normalizeAuthUser(user);

    const emailResult = await sendEmail({
      to: email,
      subject: "Verify your ContractorFlow account",
      html: `<p>Hi ${normalized.name || "there"},</p><p>Click the link below to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
      text: `Hi ${normalized.name || "there"},\n\nVerify your account:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      metadata: { tenantId: normalized.tenantId },
    });

    if (!emailResult?.success) {
      console.error("Failed to resend verification email", {
        provider: emailResult?.provider || "unknown",
        error: emailResult?.error || "Unknown email provider error",
        email,
        tenantId: normalized.tenantId,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Unable to send verification email right now",
          code: "EMAIL_DELIVERY_FAILED",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return OK;
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
