import "server-only";

import { sendEmail } from "@/lib/email";
import { sendTextMessage } from "@/lib/sms";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Soft-fail email + SMS delivery of a live job progress link.
 * Never throws — returns a delivery report like estimate notifications.
 */
export async function deliverJobProgressNotifications({
  progressUrl,
  clientName = "",
  clientEmail = "",
  clientPhone = "",
  jobTitle = "",
  tenantId = "",
  sendEmail: wantEmail = true,
  sendSms = true,
} = {}) {
  const result = {
    email: { attempted: false, sent: false, error: null },
    sms: { attempted: false, sent: false, error: null },
  };

  const url = String(progressUrl || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return result;
  }

  let companyName = "your contractor";
  try {
    if (tenantId) {
      const profile = await getCompanyProfileByTenant({ tenantId });
      if (profile?.companyName) companyName = profile.companyName;
    }
  } catch {
    // branding soft-fail
  }

  const name = String(clientName || "there").trim() || "there";
  const title = String(jobTitle || "your project").trim() || "your project";
  const emailTo = String(clientEmail || "").trim();
  const phoneTo = String(clientPhone || "").trim();

  if (wantEmail && emailTo) {
    result.email.attempted = true;
    try {
      const safeName = escapeHtml(name);
      const safeCompany = escapeHtml(companyName);
      const safeTitle = escapeHtml(title);
      const safeHref = escapeUrl(url);
      const safeLinkText = escapeHtml(url);
      await sendEmail({
        to: [emailTo],
        subject: `Live updates for ${title}`,
        text: `Hi ${name},\n\nFollow live progress on ${title} from ${companyName}:\n${url}\n\nYou'll see photos and videos as the crew documents the job.\n\nThank you!`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="color:#0f172a;margin-bottom:8px">Live job progress</h2>
            <p style="color:#475569">Hi ${safeName},</p>
            <p style="color:#475569">
              Follow photos and videos for <strong>${safeTitle}</strong> from ${safeCompany}.
            </p>
            <p style="margin:24px 0">
              <a href="${safeHref}" style="background:#0f172a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">
                View live progress
              </a>
            </p>
            <p style="color:#94a3b8;font-size:12px">${safeLinkText}</p>
          </div>
        `,
        metadata: { kind: "job-progress-link", tenantId },
      });
      result.email.sent = true;
    } catch (error) {
      result.email.error = error?.message || "email_failed";
      console.warn("[job-progress-notify] email soft-fail", result.email.error);
    }
  }

  if (sendSms && phoneTo) {
    result.sms.attempted = true;
    try {
      const sms = await sendTextMessage({
        to: phoneTo,
        text: `${companyName}: follow live progress on ${title}: ${url}`,
      });
      if (sms?.success === false) {
        result.sms.error = sms.error || "sms_failed";
      } else {
        result.sms.sent = true;
      }
    } catch (error) {
      result.sms.error = error?.message || "sms_failed";
      console.warn("[job-progress-notify] sms soft-fail", result.sms.error);
    }
  }

  return result;
}
