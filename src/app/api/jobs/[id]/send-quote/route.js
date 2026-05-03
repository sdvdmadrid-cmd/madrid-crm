import crypto from "node:crypto";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { sendEmail } from "@/lib/email";
import { logSupabaseError } from "@/lib/supabase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canSendExternal,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const JOBS = "jobs";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

function buildEmailTemplate({
  companyName,
  clientName,
  jobTitle,
  price,
  quoteUrl,
}) {
  const safeCompany = companyName || "FieldBase";
  const safeClient = clientName || "Client";
  const safeJob = jobTitle || "your estimate";
  const priceDisplay = price ? `$${Number(price).toFixed(2)}` : null;

  const subject = `${safeCompany} — Your quote is ready: ${safeJob}`;

  const text = [
    `Hi ${safeClient},`,
    "",
    `Your quote is ready: ${safeJob}`,
    priceDisplay ? `Total: ${priceDisplay}` : "",
    "",
    `To accept this quote, visit: ${quoteUrl}`,
    `To request changes, visit: ${quoteUrl}`,
    "",
    `Thank you,`,
    safeCompany,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#16a34a;padding:28px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${safeCompany}</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Quote ready for your review</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px;">
            <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi <strong>${safeClient}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Your quote is ready. Please review the details below and let us know how you would like to proceed.
            </p>

            <!-- Quote card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Project</p>
                  <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;">${safeJob}</p>
                  ${
                    priceDisplay
                      ? `
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Total</p>
                  <p style="margin:0;font-size:24px;font-weight:800;color:#16a34a;">${priceDisplay}</p>
                  `
                      : ""
                  }
                </td>
              </tr>
            </table>

            <!-- CTA buttons -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:8px;" width="50%">
                  <a href="${quoteUrl}#approve"
                     style="display:block;text-align:center;padding:14px 20px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:-0.1px;">
                    ✓ Accept Quote
                  </a>
                </td>
                <td style="padding-left:8px;" width="50%">
                  <a href="${quoteUrl}#changes"
                     style="display:block;text-align:center;padding:14px 20px;background:#ffffff;color:#374151;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;border:1.5px solid #d1d5db;">
                    ✎ Request Changes
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">
              Or open this link: <a href="${quoteUrl}" style="color:#16a34a;">${quoteUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              Sent by ${safeCompany} via FieldBase
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export async function POST(request, { params }) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canSendExternal(role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid job id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const recipientEmail = String(body.recipientEmail || "")
      .trim()
      .toLowerCase();

    if (!isValidEmail(recipientEmail)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Valid recipientEmail is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let jobQuery = supabaseAdmin.from(JOBS).select("*").eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      jobQuery = jobQuery.eq("tenant_id", tenantDbId);
    }

    const { data: job, error: jobError } = await jobQuery.maybeSingle();
    if (jobError) {
      logSupabaseError(
        "[api/jobs/:id/send-quote] Supabase job query error",
        jobError,
        { id, tenantDbId, role },
      );
      throw new Error(jobError.message);
    }

    if (!job) {
      return new Response(
        JSON.stringify({ success: false, error: "Job not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const quoteToken = job.quote_token
      ? String(job.quote_token)
      : `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;

    const baseUrl = process.env.APP_BASE_URL || new URL(request.url).origin;
    const quoteUrl = `${baseUrl.replace(/\/$/, "")}/quote/${quoteToken}`;

    const companyProfile = await getCompanyProfileByTenant({
      tenantId: tenantDbId,
    });
    const companyName = companyProfile?.companyName || "FieldBase";

    const template = buildEmailTemplate({
      companyName,
      clientName: job.client_name || "Client",
      jobTitle: job.title || "Estimate",
      price: job.price || null,
      quoteUrl,
    });

    const sendResult = await sendEmail({
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      metadata: {
        tenantId: tenantDbId,
        quoteToken,
        jobId: job.id,
      },
    });

    const now = new Date();

    let updateQuery = supabaseAdmin
      .from(JOBS)
      .update({
        quote_token: quoteToken,
        quote_shared_at: now.toISOString(),
        quote_sent_at: sendResult.success
          ? now.toISOString()
          : job.quote_sent_at || null,
        quote_sent_to: sendResult.success
          ? recipientEmail
          : job.quote_sent_to || "",
        updated_at: now.toISOString(),
      })
      .eq("id", id);

    if ((role || "").toLowerCase() !== "super_admin") {
      updateQuery = updateQuery.eq("tenant_id", tenantDbId);
    }

    const { error: updateError } = await updateQuery;
    if (updateError) {
      logSupabaseError(
        "[api/jobs/:id/send-quote] Supabase job update error",
        updateError,
        { id, tenantDbId, role, recipientEmail, quoteToken },
      );
      throw new Error(updateError.message);
    }

    if (!sendResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: sendResult.error || "Unable to send email",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          recipientEmail,
          quoteToken,
          quoteUrl,
          provider: sendResult.provider,
          sentByUserId: userId || null,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/jobs/:id/send-quote] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
