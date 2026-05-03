import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { normalizeRecipients, sendEmail } from "@/lib/email";
import { computeInvoicePaymentState } from "@/lib/invoice-payments";
import {
  createStripeCheckoutSessionForAccess,
  getStripeServerClient,
  requireInvoicePaymentAccess,
} from "@/lib/stripe-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const INVOICES = "invoices";

export const runtime = "nodejs";

function buildInvoiceEmailTemplate({
  companyName,
  clientName,
  invoiceNumber,
  invoiceTitle,
  amount,
  dueDate,
  checkoutUrl,
}) {
  const safeCompany = companyName || "FieldBase";
  const safeClient = clientName || "Client";
  const safeInvoice = invoiceNumber || "Invoice";
  const safeTitle = invoiceTitle || "Service invoice";
  const safeAmount = Number(amount || 0).toFixed(2);
  const safeDueDate = dueDate || "Not specified";
  const safeCheckoutUrl = String(checkoutUrl || "").trim();

  const subject = `${safeCompany} - ${safeInvoice}`;
  const text = [
    `Hi ${safeClient},`,
    "",
    `Your invoice is ready: ${safeInvoice}`,
    `Description: ${safeTitle}`,
    `Amount due: $${safeAmount}`,
    `Due date: ${safeDueDate}`,
    "",
    safeCheckoutUrl
      ? `Pay securely online: ${safeCheckoutUrl}`
      : "If you already received a payment link, you can complete payment securely online.",
    "For questions, reply to this email.",
    "",
    `Thank you,`,
    safeCompany,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
      <p>Hi ${safeClient},</p>
      <p>Your invoice is ready: <strong>${safeInvoice}</strong>.</p>
      <ul>
        <li><strong>Description:</strong> ${safeTitle}</li>
        <li><strong>Amount due:</strong> $${safeAmount}</li>
        <li><strong>Due date:</strong> ${safeDueDate}</li>
      </ul>
      ${
        safeCheckoutUrl
          ? `<p><a href="${safeCheckoutUrl}" style="display:inline-block;padding:10px 14px;background:#111;color:#fff;text-decoration:none;border-radius:8px;">Pay invoice securely</a></p><p>Or open this link: <br /><a href="${safeCheckoutUrl}">${safeCheckoutUrl}</a></p>`
          : "<p>If you already received a payment link, you can complete payment securely online.</p>"
      }
      <p>For questions, reply to this email.</p>
      <p>Thank you,<br />${safeCompany}</p>
    </div>
  `;

  return { subject, text, html };
}

export async function POST(request, { params }) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }
    if (!canManageSensitive(role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid invoice id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const explicitRecipient = String(body.recipientEmail || "")
      .trim()
      .toLowerCase();

    const access = await requireInvoicePaymentAccess(request, id);
    if (access.response) {
      return access.response;
    }
    const invoice = access.invoice;

    const recipientEmail =
      normalizeRecipients([explicitRecipient, invoice.client_email])[0] || "";

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "No valid recipient email found. Add client email or provide recipientEmail.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const companyProfile = await getCompanyProfileByTenant({
      tenantId: tenantDbId,
    });

    const stripe = getStripeServerClient();
    let checkoutUrl = "";
    let checkoutSessionId = "";

    try {
      const checkoutResult = stripe
        ? await createStripeCheckoutSessionForAccess({
            request,
            access,
            amount: invoice.balance_due || invoice.amount,
            source: "invoice_email",
          })
        : { checkoutUrl: "", sessionId: "" };
      if (checkoutResult.response) {
        throw new Error("Unable to create checkout session");
      }
      checkoutUrl = checkoutResult.checkoutUrl;
      checkoutSessionId = checkoutResult.sessionId;
    } catch (checkoutError) {
      console.error("Failed to create invoice checkout URL", checkoutError);
    }

    const paymentState = computeInvoicePaymentState({
      amount: invoice.amount,
      payments: invoice.payments,
    });

    const template = buildInvoiceEmailTemplate({
      companyName: companyProfile?.companyName || "FieldBase",
      clientName: invoice.client_name || "Client",
      invoiceNumber: invoice.invoice_number || "Invoice",
      invoiceTitle: invoice.invoice_title || "Service invoice",
      amount: paymentState.balanceDue || invoice.amount || 0,
      dueDate: invoice.due_date || "",
      checkoutUrl,
    });

    const sendResult = await sendEmail({
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      metadata: {
        tenantId: tenantDbId,
        invoiceId: invoice.id,
        invoiceNumber: String(invoice.invoice_number || ""),
        recipient: recipientEmail,
      },
    });

    const nowIso = new Date().toISOString();

    const updatePayload = {
      invoice_email_last_attempt_at: nowIso,
      invoice_email_last_attempt_to: recipientEmail,
      updated_at: nowIso,
    };

    if (checkoutUrl) {
      updatePayload.last_checkout_url = checkoutUrl;
    }
    if (checkoutSessionId) {
      updatePayload.last_checkout_session_id = checkoutSessionId;
    }

    if (sendResult.success) {
      updatePayload.invoice_email_sent_at = nowIso;
      updatePayload.invoice_email_sent_to = recipientEmail;
    }

    let updateQuery = supabaseAdmin
      .from(INVOICES)
      .update(updatePayload)
      .eq("id", invoice.id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      updateQuery = supabaseAdmin
        .from(INVOICES)
        .update(updatePayload)
        .eq("id", invoice.id)
        .eq("tenant_id", tenantDbId)
        .select("*")
        .maybeSingle();
    }

    const { data: updatedInvoice, error: updateError } = await updateQuery;
    if (updateError) {
      logSupabaseError(
        "[api/invoices/:id/send] Supabase update error",
        updateError,
        { id, tenantDbId, role, recipientEmail },
      );
      throw new Error(updateError.message);
    }

    const { error: emailLogError } = await supabaseAdmin
      .from("email_logs")
      .insert({
        tenant_id: tenantDbId,
        user_id: userId || null,
        campaign_id: null,
        recipient: recipientEmail,
        provider: sendResult.provider || "mock",
        provider_message_id: sendResult.providerMessageId || null,
        status: sendResult.success ? "sent" : "failed",
        error: sendResult.error || null,
        event_type: "invoice_sent",
        invoice_id: invoice.id,
        invoice_number: String(invoice.invoice_number || ""),
        created_by: userId || null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    if (emailLogError) {
      logSupabaseError(
        "[api/invoices/:id/send] Supabase email log insert error",
        emailLogError,
        { id, tenantDbId, recipientEmail },
      );
    }

    if (!sendResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: sendResult.error || "Unable to send invoice email",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          recipientEmail,
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId || null,
          invoice: updatedInvoice
            ? {
                ...updatedInvoice,
                _id: updatedInvoice.id,
              }
            : null,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/invoices/:id/send] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
