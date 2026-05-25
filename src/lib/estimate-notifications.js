import {
  getEstimateBrandingByTenant,
  renderLogoEmailHeader,
} from "@/lib/estimate-email-branding";
import { buildPublicEstimateLink } from "@/lib/estimate-public-access";
import { sendEmail } from "@/lib/email";
import { sendTextMessage } from "@/lib/sms";

/**
 * Send the estimate-ready email and/or SMS and return a structured delivery
 * report. The caller propagates this report to the UI so the contractor sees
 * a warning if the customer never received the link, instead of silently
 * swallowing provider errors as before.
 *
 * Shape:
 *   {
 *     email: { attempted: boolean, sent: boolean, error: string | null },
 *     sms:   { attempted: boolean, sent: boolean, error: string | null },
 *   }
 */
export async function deliverEstimateNotifications({
  estimate,
  sendChannels,
  requestedStatus,
  contextLabel = "api/estimates",
}) {
  const channels =
    sendChannels && typeof sendChannels === "object" ? sendChannels : {};
  const sendViaEmail = channels.email !== false;
  const sendViaText = channels.text === true;
  const isSending = requestedStatus === "sent";

  const result = {
    email: { attempted: false, sent: false, error: null },
    sms: { attempted: false, sent: false, error: null },
  };

  if (!isSending || !estimate?.id) {
    return result;
  }

  const estimateLink = buildPublicEstimateLink(
    estimate.id,
    (process.env.APP_URL || process.env.APP_BASE_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    ),
  );
  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(estimate.total || 0);
  const clientName = estimate.clientName || "Friend";

  // Pull contractor branding (logo + placement) so the customer sees the
  // company's identity in the email instead of an unbranded notice. Failures
  // here fall back to no logo — the email still goes out.
  const branding = await getEstimateBrandingByTenant(estimate.tenantId);
  const logoHeader = renderLogoEmailHeader(branding);
  const senderName = branding.companyName || "your contractor";

  if (sendViaEmail && estimate.clientEmail && estimateLink) {
    result.email.attempted = true;
    try {
      const emailResult = await sendEmail({
        to: [estimate.clientEmail],
        subject: `Your Estimate is Ready — ${estimate.estimateNumber || estimate.id}`,
        text: `Hi ${clientName},\n\nYour estimate from ${senderName} for ${total} is ready for review.\n\nView and respond here:\n${estimateLink}\n\nThank you!`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            ${logoHeader}
            <h2 style="color:#0f172a;margin-bottom:8px">Your Estimate is Ready</h2>
            <p style="color:#475569;margin-bottom:16px">Hi ${clientName},</p>
            <p style="color:#475569">${
              branding.companyName
                ? `Your estimate from <strong>${branding.companyName.replace(/</g, "&lt;")}</strong> has been prepared.`
                : "Your estimate has been prepared."
            } Please review the details and let us know how you'd like to proceed.</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Total</div>
              <div style="color:#0f172a;font-size:24px;font-weight:700">${total}</div>
            </div>
            <a href="${estimateLink}" style="display:inline-block;background:#059669;color:#fff;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:16px">
              View Estimate &amp; Respond
            </a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px">If the button doesn't work, copy this link:<br><a href="${estimateLink}" style="color:#3b82f6">${estimateLink}</a></p>
          </div>`,
      });
      if (emailResult?.success === false) {
        result.email.error = String(
          emailResult.error || "Email provider returned an error",
        );
        console.warn(`[${contextLabel}] email send failed:`, result.email.error);
      } else {
        result.email.sent = true;
      }
    } catch (emailErr) {
      result.email.error = String(emailErr?.message || emailErr);
      console.warn(`[${contextLabel}] email send failed:`, result.email.error);
    }
  }

  if (sendViaText && estimate.clientPhone && estimateLink) {
    result.sms.attempted = true;
    try {
      const smsText = branding.companyName
        ? `${branding.companyName}: your estimate for ${total} is ready: ${estimateLink}`
        : `Your estimate for ${total} is ready: ${estimateLink}`;
      const smsResult = await sendTextMessage({
        to: estimate.clientPhone,
        text: smsText,
      });
      if (smsResult?.success === false) {
        result.sms.error = String(
          smsResult.error || "SMS provider returned an error",
        );
        console.warn(`[${contextLabel}] sms send failed:`, result.sms.error);
      } else {
        result.sms.sent = true;
      }
    } catch (smsErr) {
      result.sms.error = String(smsErr?.message || smsErr);
      console.warn(`[${contextLabel}] sms send failed:`, result.sms.error);
    }
  }

  return result;
}
