import {
  checkPublicQuoteRateLimit,
  getRequestIp,
  recordPublicQuoteAttempt,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createQuoteSignatureAuditRecord,
  sanitizeSignatureDrawDataUrl,
} from "@/lib/quote-signatures";

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

function getMissingColumnName(errorMessage) {
  const message = String(errorMessage || "");
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] || "";
}

async function updateQuoteWithSchemaFallback({ quoteId, tenantId, update }) {
  const candidateUpdate = { ...update };
  const droppedColumns = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabaseAdmin
      .from(QUOTES)
      .update(candidateUpdate)
      .eq("id", quoteId)
      .eq("tenant_id", tenantId || null);

    if (!error) {
      // Surface a loud warning when we degraded the write because the schema
      // is missing columns. This signals that the pending migration is not
      // yet applied in production, which can cause subtle data loss (e.g.
      // signature evidence not being persisted). The previous silent retry
      // hid this from operators.
      if (droppedColumns.length > 0) {
        console.warn(
          "[updateQuoteWithSchemaFallback] schema drift: dropped columns from update",
          { quoteId, tenantId, droppedColumns },
        );
      }
      return { error: null, appliedUpdate: candidateUpdate, droppedColumns };
    }

    const missingColumn = getMissingColumnName(error.message);
    if (!missingColumn || !(missingColumn in candidateUpdate)) {
      return { error, appliedUpdate: candidateUpdate, droppedColumns };
    }

    droppedColumns.push(missingColumn);
    delete candidateUpdate[missingColumn];
  }

  console.error(
    "[updateQuoteWithSchemaFallback] gave up after 8 retries — schema mismatch unresolved",
    { quoteId, tenantId, droppedColumns },
  );

  return {
    error: new Error("Failed to update quote due to repeated schema mismatches"),
    appliedUpdate: candidateUpdate,
    droppedColumns,
  };
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
    if (!["approve", "sign", "decline"].includes(action)) {
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
    const signatureDrawDataUrl = sanitizeSignatureDrawDataUrl(
      body.signatureDrawDataUrl,
    );
    const acceptedElectronicConsent = body.acceptElectronicConsent === true;

    if (action === "sign" && !signatureText && !signatureDrawDataUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Signature is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (action === "sign" && !acceptedElectronicConsent) {
      return new Response(
        JSON.stringify({ success: false, error: "Electronic signature consent is required" }),
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
      const nextStatus = action === "sign"
        ? "signed"
        : action === "decline"
          ? "declined"
          : "approved";
      const update = {
        status: nextStatus,
        approved_at: action === "decline" ? quoteRow.approved_at || null : quoteRow.approved_at || nowIso,
        quote_approved_by_name: action === "decline"
          ? quoteRow.quote_approved_by_name || ""
          : contactName || quoteRow.quote_approved_by_name || "",
        quote_approved_by_email: action === "decline"
          ? quoteRow.quote_approved_by_email || ""
          : contactEmail || quoteRow.quote_approved_by_email || "",
        quote_signed_at: action === "sign" ? nowIso : quoteRow.quote_signed_at || null,
        quote_signed_by_name: action === "sign"
          ? contactName || quoteRow.quote_signed_by_name || ""
          : quoteRow.quote_signed_by_name || "",
        quote_signed_by_email: action === "sign"
          ? contactEmail || quoteRow.quote_signed_by_email || ""
          : quoteRow.quote_signed_by_email || "",
        quote_signature_text: action === "sign"
          ? signatureText || contactName || quoteRow.quote_signature_text || ""
          : quoteRow.quote_signature_text || "",
        updated_at: nowIso,
      };

      const { error: quoteUpdateError, appliedUpdate } =
        await updateQuoteWithSchemaFallback({
          quoteId: quoteRow.id,
          tenantId: quoteRow.tenant_id,
          update,
        });
      if (quoteUpdateError) {
        console.error(
          "[api/public/quotes/:token/approval][POST] Supabase quote update error",
          quoteUpdateError,
        );
        throw new Error(quoteUpdateError.message);
      }

      const signatureEvidence = action === "sign"
        ? await createQuoteSignatureAuditRecord({
            request,
            quote: {
              ...quoteRow,
              ...appliedUpdate,
            },
            contactName,
            contactEmail,
            signatureText: signatureText || contactName,
            signatureDrawDataUrl,
            acceptedElectronicConsent,
          })
        : null;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            quoteStatus: nextStatus,
            quoteApprovedAt: appliedUpdate.approved_at || quoteRow.approved_at || "",
            quoteSignedAt: appliedUpdate.quote_signed_at || quoteRow.quote_signed_at || "",
            quoteApprovedByName:
              appliedUpdate.quote_approved_by_name ||
              quoteRow.quote_approved_by_name ||
              "",
            quoteApprovedByEmail:
              appliedUpdate.quote_approved_by_email ||
              quoteRow.quote_approved_by_email ||
              "",
            quoteSignedByName:
              appliedUpdate.quote_signed_by_name ||
              quoteRow.quote_signed_by_name ||
              "",
            quoteSignedByEmail:
              appliedUpdate.quote_signed_by_email ||
              quoteRow.quote_signed_by_email ||
              "",
            quoteSignatureText:
              appliedUpdate.quote_signature_text ||
              quoteRow.quote_signature_text ||
              "",
            signatureEvidence,
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
      quote_status: action === "sign" ? "signed" : action === "decline" ? "declined" : "approved",
      quote_approved_at: action === "decline" ? job.quote_approved_at || null : job.quote_approved_at || now.toISOString(),
      quote_approved_by_name: contactName || job.quote_approved_by_name || "",
      quote_approved_by_email:
        contactEmail || job.quote_approved_by_email || "",
      updated_at: now.toISOString(),
      status: action === "decline" ? "Pending" : "Active",
    };

    if (action === "sign") {
      update.quote_signed_at = now.toISOString();
      update.quote_signed_by_name =
        contactName || job.quote_signed_by_name || "";
      update.quote_signed_by_email =
        contactEmail || job.quote_signed_by_email || "";
      update.quote_signature_text = signatureText || contactName || "";
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

    const signatureEvidence = action === "sign"
      ? await createQuoteSignatureAuditRecord({
          request,
          quote: {
            ...job,
            id: job.id,
            quote_token: quoteToken,
            quote_number: job.quote_number || "",
            line_items: Array.isArray(job.items) ? job.items : [],
            price: job.price || 0,
            scope_of_work: job.scope_details || "",
          },
          contactName,
          contactEmail,
          signatureText: signatureText || contactName,
          signatureDrawDataUrl,
          acceptedElectronicConsent,
        })
      : null;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          quoteStatus: update.quote_status,
          quoteApprovedAt:
            update.quote_approved_at instanceof Date
              ? update.quote_approved_at.toISOString()
              : update.quote_approved_at || "",
          quoteSignedAt:
            update.quote_signed_at instanceof Date
              ? update.quote_signed_at.toISOString()
              : update.quote_signed_at || "",
          quoteApprovedByName: update.quote_approved_by_name,
          quoteApprovedByEmail: update.quote_approved_by_email,
          quoteSignedByName: update.quote_signed_by_name || "",
          quoteSignedByEmail: update.quote_signed_by_email || "",
          quoteSignatureText: update.quote_signature_text || "",
          signatureEvidence,
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
