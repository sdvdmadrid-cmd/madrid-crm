import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import {
  createReviewRequest,
  listTenantReviewRequests,
  revokeReviewRequest,
} from "@/lib/review-requests";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { sendEmail } from "@/lib/email";
import { sendTextMessage } from "@/lib/sms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolveAppOrigin(request) {
  const fromEnv = (process.env.APP_URL || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  try {
    const { origin } = new URL(request.url);
    return origin;
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * GET /api/reputation/request-review
 * Lists the contractor's review-request history (most recent first).
 */
export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const data = await listTenantReviewRequests(tenantDbId, { limit: 100 });
    return jsonResponse({ success: true, data });
  } catch (error) {
    console.error("[api/reputation/request-review][GET]", error);
    return jsonResponse({ success: false, error: "Unable to load review requests" }, 500);
  }
}

/**
 * POST /api/reputation/request-review
 * Issues a review-request token and sends it to the customer.
 *
 * Body:
 *   - customerName?: string
 *   - customerEmail?: string (required if no phone)
 *   - customerPhone?: string (required if no email)
 *   - jobId?: string  (optional reference)
 *   - invoiceId?: string
 *   - estimateId?: string
 *   - message?: string  (extra contractor note included in the email body)
 *   - channel?: "email" | "sms" | "both"
 */
export async function POST(request) {
  try {
    const sameOriginBlock = enforceSameOriginForMutation(request);
    if (sameOriginBlock) return sameOriginBlock;
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const { tenantDbId, userId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const customerEmail = String(body.customerEmail || "").trim();
    const customerPhone = String(body.customerPhone || "").trim();
    if (!customerEmail && !customerPhone) {
      return jsonResponse(
        { success: false, error: "Either an email or phone is required." },
        400,
      );
    }
    if (customerEmail && !EMAIL_RE.test(customerEmail)) {
      return jsonResponse(
        { success: false, error: "That email address looks invalid." },
        400,
      );
    }

    const channelInput = String(body.channel || "email").toLowerCase();
    const channel = ["email", "sms", "both"].includes(channelInput) ? channelInput : "email";

    const created = await createReviewRequest({
      tenantId: tenantDbId,
      requestedByUserId: userId,
      customerName: String(body.customerName || ""),
      customerEmail,
      customerPhone,
      jobId: String(body.jobId || "") || null,
      invoiceId: String(body.invoiceId || "") || null,
      estimateId: String(body.estimateId || "") || null,
      message: String(body.message || ""),
      channel,
    });

    // Compose the customer-facing email/SMS using the contractor's
    // company profile so the message is signed correctly.
    let companyName = "your contractor";
    try {
      const profile = await getCompanyProfileByTenant({ tenantId: tenantDbId });
      if (profile?.companyName) companyName = profile.companyName;
    } catch (err) {
      console.warn(
        "[api/reputation/request-review] company profile load failed",
        err?.message,
      );
    }

    const origin = resolveAppOrigin(request);
    const customerName = String(body.customerName || "").trim();
    const greeting = customerName ? `Hi ${customerName.split(" ")[0]},` : "Hi,";
    const reviewLink = `${origin}/r/${encodeURIComponent(created.token || "")}`;

    const delivery = { email: { attempted: false }, sms: { attempted: false } };

    if ((channel === "email" || channel === "both") && customerEmail) {
      delivery.email.attempted = true;
      try {
        const messageBlock = body.message
          ? `<blockquote style="border-left:3px solid #cbd5f5;padding-left:12px;color:#475569;margin:18px 0">${String(body.message).replace(/</g, "&lt;").slice(0, 500)}</blockquote>`
          : "";
        const result = await sendEmail({
          to: [customerEmail],
          subject: `How did we do? Leave ${companyName} a review`,
          text: [
            greeting,
            "",
            `Thanks for choosing ${companyName}. A quick review would mean the world to us — it helps other neighbors find a contractor they can trust.`,
            "",
            body.message ? `Note from ${companyName}: ${body.message}` : "",
            "",
            `Leave a review (takes ~60 seconds): ${reviewLink}`,
            "",
            `— ${companyName}`,
          ]
            .filter(Boolean)
            .join("\n"),
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="color:#0f172a;margin-bottom:8px">How did we do?</h2>
              <p style="color:#475569;margin-bottom:14px">${greeting}</p>
              <p style="color:#475569;line-height:1.6">Thanks for choosing <strong>${companyName.replace(/</g, "&lt;")}</strong>.
              A quick review would mean the world to us — it helps other neighbors find a contractor they can trust.</p>
              ${messageBlock}
              <p style="text-align:center;margin:24px 0">
                <a href="${reviewLink}" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Leave a review</a>
              </p>
              <p style="color:#94a3b8;font-size:12px;text-align:center;line-height:1.5">If the button doesn't work, paste this link into your browser:<br/><a href="${reviewLink}" style="color:#2563eb">${reviewLink}</a></p>
            </div>`,
        });
        delivery.email = { attempted: true, success: result?.success !== false };
      } catch (err) {
        console.warn("[api/reputation/request-review] email send failed", err?.message);
        delivery.email = { attempted: true, success: false, error: err?.message };
      }
    }

    if ((channel === "sms" || channel === "both") && customerPhone) {
      delivery.sms.attempted = true;
      try {
        const result = await sendTextMessage({
          to: customerPhone,
          text: `${companyName}: thanks for the work! A 60-sec review would mean a lot. ${reviewLink}`,
        });
        delivery.sms = { attempted: true, success: result?.success !== false };
      } catch (err) {
        console.warn("[api/reputation/request-review] sms send failed", err?.message);
        delivery.sms = { attempted: true, success: false, error: err?.message };
      }
    }

    return jsonResponse({
      success: true,
      data: {
        request: created,
        reviewLink,
        delivery,
      },
    });
  } catch (error) {
    console.error("[api/reputation/request-review][POST]", error);
    return jsonResponse(
      { success: false, error: error?.message || "Unable to send review request" },
      500,
    );
  }
}

/**
 * DELETE /api/reputation/request-review?id=...
 * Revokes a previously-sent review request.
 */
export async function DELETE(request) {
  try {
    const sameOriginBlock = enforceSameOriginForMutation(request);
    if (sameOriginBlock) return sameOriginBlock;
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return jsonResponse({ success: false, error: "id is required" }, 400);
    const ok = await revokeReviewRequest({ tenantId: tenantDbId, id });
    return jsonResponse({ success: ok });
  } catch (error) {
    console.error("[api/reputation/request-review][DELETE]", error);
    return jsonResponse({ success: false, error: "Unable to revoke" }, 500);
  }
}
