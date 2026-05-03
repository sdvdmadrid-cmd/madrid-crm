import {
  checkPublicQuoteRateLimit,
  getRequestIp,
  recordPublicQuoteAttempt,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const JOBS = "jobs";
const QUOTES = "quotes";

function isValidQuoteToken(value) {
  const token = String(value || "").trim();
  return token.length >= 24 && /^[a-zA-Z0-9_-]+$/.test(token);
}

function sanitizeText(value, maxLen) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const quoteToken = String(token || "").trim();

    if (!isValidQuoteToken(quoteToken)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const ip = getRequestIp(request);
    const limitState = await checkPublicQuoteRateLimit({
      token: quoteToken,
      ip,
      action: "approval",
    });
    if (!limitState.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Too many requests. Please try again shortly.",
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

    await recordPublicQuoteAttempt({
      token: quoteToken,
      ip,
      action: "approval",
    });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "")
      .trim()
      .toLowerCase();
    if (!["approve", "sign"].includes(action)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid action" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const contactName = sanitizeText(body.contactName, 100);
    const contactEmail = sanitizeText(body.contactEmail, 160).toLowerCase();
    const signatureText = sanitizeText(body.signatureText, 200);

    if (action === "sign" && !signatureText) {
      return new Response(
        JSON.stringify({ success: false, error: "Signature is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { data: quoteRow, error: quoteError } = await supabaseAdmin
      .from(QUOTES)
      .select("*")
      .eq("quote_token", quoteToken)
      .maybeSingle();
    if (quoteError) {
      console.error(
        "[api/public/quotes/:token/approval][POST] Supabase quote query error",
        quoteError,
      );
      throw new Error(quoteError.message);
    }

    if (quoteRow) {
      const currentStatus = String(quoteRow.status || "").toLowerCase();
      if (currentStatus === "signed") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "This quote is already signed and cannot be edited.",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const nowIso = new Date().toISOString();
      const nextStatus = action === "sign" ? "signed" : "approved";
      const update = {
        status: nextStatus,
        approved_at: quoteRow.approved_at || nowIso,
        updated_at: nowIso,
      };

      const { error: quoteUpdateError } = await supabaseAdmin
        .from(QUOTES)
        .update(update)
        .eq("id", quoteRow.id)
        .eq("tenant_id", quoteRow.tenant_id || null);
      if (quoteUpdateError) {
        console.error(
          "[api/public/quotes/:token/approval][POST] Supabase quote update error",
          quoteUpdateError,
        );
        throw new Error(quoteUpdateError.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            quoteStatus: nextStatus,
            quoteApprovedAt: update.approved_at,
            quoteSignedAt: action === "sign" ? nowIso : "",
            quoteApprovedByName: contactName || "",
            quoteApprovedByEmail: contactEmail || "",
            quoteSignedByName: action === "sign" ? contactName || "" : "",
            quoteSignedByEmail: action === "sign" ? contactEmail || "" : "",
            quoteSignatureText: action === "sign" ? signatureText : "",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from(JOBS)
      .select("*")
      .eq("quote_token", quoteToken)
      .maybeSingle();
    if (jobError) {
      console.error(
        "[api/public/quotes/:token/approval][POST] Supabase job query error",
        jobError,
      );
      throw new Error(jobError.message);
    }

    if (!job) {
      return new Response(
        JSON.stringify({ success: false, error: "Quote not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const expectedRecipient = String(job.quote_sent_to || "")
      .trim()
      .toLowerCase();
    if (expectedRecipient && contactEmail !== expectedRecipient) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Approval email must match the original quote recipient",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const now = new Date();
    const update = {
      quote_status: action === "sign" ? "signed" : "approved",
      quote_approved_at: job.quote_approved_at || now.toISOString(),
      quote_approved_by_name: contactName || job.quote_approved_by_name || "",
      quote_approved_by_email:
        contactEmail || job.quote_approved_by_email || "",
      updated_at: now.toISOString(),
      status: "Active",
    };

    if (action === "sign") {
      update.quote_signed_at = now.toISOString();
      update.quote_signed_by_name =
        contactName || job.quote_signed_by_name || "";
      update.quote_signed_by_email =
        contactEmail || job.quote_signed_by_email || "";
      update.quote_signature_text = signatureText;
    }

    const { error: updateError } = await supabaseAdmin
      .from(JOBS)
      .update(update)
      .eq("id", job.id)
      .eq("tenant_id", job.tenant_id || null);
    if (updateError) {
      console.error(
        "[api/public/quotes/:token/approval][POST] Supabase job update error",
        updateError,
      );
      throw new Error(updateError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          quoteStatus: update.quote_status,
          quoteApprovedAt:
            update.quote_approved_at instanceof Date
              ? update.quote_approved_at.toISOString()
              : update.quote_approved_at,
          quoteSignedAt:
            update.quote_signed_at instanceof Date
              ? update.quote_signed_at.toISOString()
              : update.quote_signed_at || "",
          quoteApprovedByName: update.quote_approved_by_name,
          quoteApprovedByEmail: update.quote_approved_by_email,
          quoteSignedByName: update.quote_signed_by_name || "",
          quoteSignedByEmail: update.quote_signed_by_email || "",
          quoteSignatureText: update.quote_signature_text || "",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/public/quotes/:token/approval][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
