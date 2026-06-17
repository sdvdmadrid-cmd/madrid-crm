import {
  computeInvoicePaymentState,
  normalizeMoney,
  normalizePaymentMethod,
  resolveInvoiceStatus,
} from "@/lib/invoice-payments";
import { findEstimateForNumber } from "@/lib/estimate-invoice-linking";
import {
  attachFreshPartyFieldsToInvoiceRow,
  enrichInvoiceWithPartyInfo,
} from "@/lib/invoice-party";
import { normalizeInvoiceLineItemsForSave } from "@/lib/invoice-line-items";
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
  getSubscriptionBlockedResponse,
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
    clientPhone: doc.client_phone || "",
    clientAddress: doc.client_address || "",
    propertyAddress: doc.property_address || "",
    amount: amount ? String(amount) : "",
    dueDate: doc.due_date ? String(doc.due_date).slice(0, 10) : "",
    lineItems: Array.isArray(doc.items) ? doc.items : [],
    notes: doc.notes || "",
    internalNotes: doc.internal_notes || "",
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

  const paymentState = computeInvoicePaymentState(base);
  return {
    ...base,
    ...paymentState,
    status: resolveInvoiceStatus({ ...base, ...paymentState }),
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
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
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

    let invoice = serialize(data);
    invoice = await enrichInvoiceWithPartyInfo(
      supabaseAdmin,
      tenantDbId,
      invoice,
    );

    return new Response(JSON.stringify(invoice), {
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

    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
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
      dueDate:
        "dueDate" in body
          ? body.dueDate
          : existing.due_date
            ? String(existing.due_date).slice(0, 10)
            : "",
      preferredPaymentMethod:
        "preferredPaymentMethod" in body
          ? body.preferredPaymentMethod
          : existing.preferred_payment_method,
      status: "status" in body ? body.status : existing.status,
    };

    const paymentState = computeInvoicePaymentState(merged);
    const normalizedAmount = normalizeMoney(merged.amount);
    const amountCents = Math.round(normalizedAmount * 100);
    const resolvedStatus = resolveInvoiceStatus(
      { ...merged, ...paymentState },
      { requestedStatus: merged.status },
    );

    const updateRow = {
      updated_at: new Date().toISOString(),
      preferred_payment_method: normalizePaymentMethod(
        merged.preferredPaymentMethod,
      ),
      payments: paymentState.payments,
      paid_amount: paymentState.paidAmount,
      balance_due: paymentState.balanceDue,
      status: resolvedStatus,
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
      updateRow.items = normalizeInvoiceLineItemsForSave(body.lineItems);
    }
    if ("notes" in body) updateRow.notes = String(body.notes || "");
    if ("internalNotes" in body)
      updateRow.internal_notes = String(body.internalNotes || "");

    updateRow.estimate_id = estimateId;
    updateRow.quote_id = quoteId;
    updateRow.quote_number = quoteNumber;

    Object.assign(
      updateRow,
      await attachFreshPartyFieldsToInvoiceRow(
        supabaseAdmin,
        tenantDbId,
        updateRow,
        {
          clientId: updateRow.client_id ?? existing.client_id,
          clientName: updateRow.client_name ?? existing.client_name,
          clientEmail: updateRow.client_email ?? existing.client_email,
        },
      ),
    );

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

    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
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
