import {
  computeInvoicePaymentState,
  normalizeMoney,
  normalizePaymentMethod,
} from "@/lib/invoice-payments";
import { findEstimateForNumber } from "@/lib/estimate-invoice-linking";
import { normalizeBaseNumber } from "@/lib/quote-numbering";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  logSupabaseError,
  normalizeTimestamp,
  normalizeUuid,
} from "@/lib/supabase-db";
import {
  canDelete,
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const INVOICES = "invoices";

function serialize(doc) {
  const amount = Number(
    doc.amount ?? (Number(doc.total_cents || 0) / 100 || 0),
  );
  const base = {
    _id: doc.id,
    id: doc.id,
    tenantId: doc.tenant_id || "",
    userId: doc.user_id || null,
    invoiceNumber: doc.invoice_number || "",
    invoiceTitle: doc.invoice_title || "",
    quoteId: doc.quote_id || null,
    quoteNumber: doc.quote_number || "",
    jobId: doc.job_id || "",
    clientId: doc.client_id || "",
    clientName: doc.client_name || "",
    clientEmail: doc.client_email || "",
    amount: amount ? String(amount) : "",
    dueDate: doc.due_date ? String(doc.due_date).slice(0, 10) : "",
    lineItems: Array.isArray(doc.items) ? doc.items : [],
    notes: doc.notes || "",
    preferredPaymentMethod: normalizePaymentMethod(
      doc.preferred_payment_method,
    ),
    payments: Array.isArray(doc.payments) ? doc.payments : [],
    paidAmount: Number(doc.paid_amount || 0),
    balanceDue: Number(doc.balance_due || 0),
    status: doc.status || "Unpaid",
    createdAt: doc.created_at || null,
    updatedAt: doc.updated_at || null,
  };

  return {
    ...base,
    ...computeInvoicePaymentState(base),
  };
}

function badId() {
  return new Response(
    JSON.stringify({ success: false, error: "Invalid invoice id" }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function notFound() {
  return new Response(
    JSON.stringify({ success: false, error: "Invoice not found" }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const { id } = await params;
    if (!id) return badId();

    let query = supabaseAdmin.from(INVOICES).select("*").eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      logSupabaseError("[api/invoices/:id][GET] Supabase query error", error, {
        id,
        tenantDbId,
        role,
      });
      throw new Error(error.message);
    }

    if (!data) return notFound();

    return new Response(JSON.stringify(serialize(data)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/invoices/:id][GET] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }
    if (!canManageSensitive(role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    if (!id) return badId();

    const body = await request.json();

    let existingQuery = supabaseAdmin.from(INVOICES).select("*").eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      existingQuery = existingQuery.eq("tenant_id", tenantDbId);
    }

    const { data: existing, error: existingError } =
      await existingQuery.maybeSingle();
    if (existingError) {
      logSupabaseError(
        "[api/invoices/:id][PATCH] Supabase existing query error",
        existingError,
        { id, tenantDbId, role },
      );
      throw new Error(existingError.message);
    }
    if (!existing) return notFound();

    const merged = {
      amount: "amount" in body ? body.amount : existing.amount,
      payments: existing.payments,
      preferredPaymentMethod:
        "preferredPaymentMethod" in body
          ? body.preferredPaymentMethod
          : existing.preferred_payment_method,
    };

    const paymentState = computeInvoicePaymentState(merged);
    const normalizedAmount = normalizeMoney(merged.amount);
    const amountCents = Math.round(normalizedAmount * 100);

    const updateRow = {
      updated_at: new Date().toISOString(),
      preferred_payment_method: normalizePaymentMethod(
        merged.preferredPaymentMethod,
      ),
      payments: paymentState.payments,
      paid_amount: paymentState.paidAmount,
      balance_due: paymentState.balanceDue,
      status: paymentState.status,
      subtotal_cents: amountCents,
      tax_cents: 0,
      total_cents: amountCents,
    };

    // Auto-link quote/estimate when invoice or quote references change.
    let estimateId = existing.estimate_id || null;
    let quoteId = existing.quote_id || null;
    let quoteNumber = normalizeBaseNumber(existing.quote_number || "");
    let linkedClientId = "clientId" in body
      ? normalizeUuid(body.clientId)
      : existing.client_id || null;
    const hasLinkInput =
      "invoiceNumber" in body || "quoteNumber" in body || "quoteId" in body;

    if (hasLinkInput) {
      const invNum = "invoiceNumber" in body
        ? normalizeBaseNumber(body.invoiceNumber)
        : normalizeBaseNumber(existing.invoice_number || "");
      const requestedQuoteId = "quoteId" in body
        ? normalizeUuid(body.quoteId)
        : quoteId;
      const requestedQuoteNumber = "quoteNumber" in body
        ? normalizeBaseNumber(body.quoteNumber)
        : quoteNumber;

      quoteId = requestedQuoteId || null;
      quoteNumber = requestedQuoteNumber || "";

      if (quoteId) {
        const { data: quoteById, error: quoteByIdErr } = await supabaseAdmin
          .from("quotes")
          .select("id,quote_number,client_id")
          .eq("tenant_id", tenantDbId)
          .eq("id", quoteId)
          .maybeSingle();

        if (!quoteByIdErr && quoteById?.id) {
          quoteNumber = normalizeBaseNumber(quoteById.quote_number);
          linkedClientId = linkedClientId || normalizeUuid(quoteById.client_id);
        } else {
          quoteId = null;
        }
      }

      const quoteLookupNumber = quoteNumber || invNum;
      if (!quoteId && quoteLookupNumber) {
        const { data: quote, error: quoteErr } = await supabaseAdmin
          .from("quotes")
          .select("id,quote_number,client_id")
          .eq("tenant_id", tenantDbId)
          .eq("quote_number", quoteLookupNumber)
          .maybeSingle();

        if (!quoteErr && quote?.id) {
          quoteId = quote.id;
          quoteNumber = normalizeBaseNumber(quote.quote_number) || quoteLookupNumber;
          linkedClientId = linkedClientId || normalizeUuid(quote.client_id);
        }
      }

      const estimateLookupNumber = quoteNumber || invNum;
      if (estimateLookupNumber) {
        const est = await findEstimateForNumber(
          supabaseAdmin,
          tenantDbId,
          estimateLookupNumber,
        );

        if (est?.id) {
          estimateId = est.id;
          linkedClientId = linkedClientId || normalizeUuid(est.client_id);
        }
      }
    }

    if ("invoiceNumber" in body)
      updateRow.invoice_number = normalizeBaseNumber(body.invoiceNumber);
    if ("invoiceTitle" in body)
      updateRow.invoice_title = String(body.invoiceTitle || "");
    if ("jobId" in body) updateRow.job_id = normalizeUuid(body.jobId);
    if ("clientId" in body || "invoiceNumber" in body)
      updateRow.client_id = linkedClientId;
    if ("clientName" in body)
      updateRow.client_name = String(body.clientName || "");
    if ("clientEmail" in body)
      updateRow.client_email = String(body.clientEmail || "");
    if ("amount" in body) updateRow.amount = normalizedAmount;
    if ("dueDate" in body)
      updateRow.due_date = normalizeTimestamp(body.dueDate);
    if ("lineItems" in body) {
      updateRow.items = Array.isArray(body.lineItems) ? body.lineItems : [];
    }
    if ("notes" in body) updateRow.notes = String(body.notes || "");

    updateRow.estimate_id = estimateId;
    updateRow.quote_id = quoteId;
    updateRow.quote_number = quoteNumber;

    let updateQuery = supabaseAdmin
      .from(INVOICES)
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      updateQuery = supabaseAdmin
        .from(INVOICES)
        .update(updateRow)
        .eq("id", id)
        .eq("tenant_id", tenantDbId)
        .select("*")
        .maybeSingle();
    }

    const { data, error } = await updateQuery;
    if (error) {
      logSupabaseError(
        "[api/invoices/:id][PATCH] Supabase update error",
        error,
        { id, tenantDbId, role, updateRow },
      );
      throw new Error(error.message);
    }

    if (!data) return notFound();

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/invoices/:id][PATCH] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }
    if (!canDelete(role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    if (!id) return badId();

    let query = supabaseAdmin.from(INVOICES).delete().eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query.select("id");
    if (error) {
      logSupabaseError(
        "[api/invoices/:id][DELETE] Supabase delete error",
        error,
        { id, tenantDbId, role },
      );
      throw new Error(error.message);
    }

    if (!data || data.length === 0) return notFound();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/invoices/:id][DELETE] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
