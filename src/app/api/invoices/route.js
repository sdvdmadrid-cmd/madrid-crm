import { findEstimateForNumber } from "@/lib/estimate-invoice-linking";
import {
  INVOICE_LOOKUP_LIMIT,
  formatInvoiceNumber,
  pickMaxInvoiceSequence,
} from "@/lib/invoice-number";
import {
  computeInvoicePaymentState,
  normalizeMoney,
  normalizePaymentMethod,
} from "@/lib/invoice-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  logSupabaseError,
  normalizeTimestamp,
  normalizeUuid,
} from "@/lib/supabase-db";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getListPaginationParams, scopeByTenant, applyUnpaginatedSafetyLimit } from "@/lib/tenant-scope";

import {
  attachFreshPartyFieldsToInvoiceRow,
  hydrateInvoiceDocsParty,
  resolveClientForInvoiceParty,
} from "@/lib/invoice-party";
import { normalizeInvoiceLineItemsForSave } from "@/lib/invoice-line-items";
import { normalizeBaseNumber } from "@/lib/quote-numbering";

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

/**
 * Allocate the next INV-#### for this tenant. Uses MAX(numeric
 * suffix) + 1 over the most-recently-created INV-shaped rows, same
 * shape the estimate-number scheme uses. The insert at the call
 * site retries on 23505 against the partial unique index on
 * (tenant_id, invoice_number) from
 * 20260606100000_quote_invoice_number_uniqueness.sql so two
 * simultaneous invoice creates can't end up with the same number.
 *
 * Previously this used `COUNT(*) + 1`, which collided whenever any
 * invoice was deleted (the count shrinks, the max doesn't) and
 * could not survive concurrency at all.
 */
async function nextInvoiceNumber(tenantId) {
  const { data, error } = await supabaseAdmin
    .from(INVOICES)
    .select("invoice_number, created_at")
    .eq("tenant_id", tenantId)
    .ilike("invoice_number", "INV-%")
    .order("created_at", { ascending: false })
    .limit(INVOICE_LOOKUP_LIMIT);

  if (error) {
    logSupabaseError("[api/invoices] nextInvoiceNumber query error", error, {
      tenantId,
    });
    throw new Error(error.message);
  }

  return formatInvoiceNumber(pickMaxInvoiceSequence(data) + 1);
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const { searchParams } = new URL(request.url);
    const { paginate, page, limit, from, to } =
      getListPaginationParams(searchParams);

    let query = scopeByTenant(
      supabaseAdmin
        .from(INVOICES)
        .select("*", { count: paginate ? "exact" : undefined })
        .order("created_at", { ascending: false }),
      { tenantDbId, role },
    );

    if (paginate) {
      query = query.range(from, to);
    } else {
      query = applyUnpaginatedSafetyLimit(query, paginate);
    }

    const { data, error, count } = await query;
    if (error) {
      logSupabaseError("[api/invoices][GET] Supabase query error", error, {
        tenantDbId,
        role,
      });
      throw new Error(error.message);
    }

    const hydrated = await hydrateInvoiceDocsParty(
      supabaseAdmin,
      tenantDbId,
      data || [],
    );
    const docs = hydrated.map(serialize);

    if (paginate) {
      const total = Number(count || 0);
      return new Response(
        JSON.stringify({
          data: docs,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(docs), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/invoices][GET] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }
    if (!canManageSensitive(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const nowIso = new Date().toISOString();
    const lineItems = normalizeInvoiceLineItemsForSave(body.lineItems);
    const amount = normalizeMoney(body.amount);
    const amountCents = Math.round(amount * 100);
    const submittedQuoteId = normalizeUuid(body.quoteId);
    const submittedQuoteNumber = normalizeBaseNumber(body.quoteNumber);

    // Explicit (caller-provided) invoice numbers are honored as-is
    // and must NOT be retried — if they collide, the caller wants
    // to know. Auto-allocated numbers go through the retry-on-23505
    // loop below.
    const explicitInvoiceNumber = normalizeBaseNumber(body.invoiceNumber);
    const hasExplicitInvoiceNumber = explicitInvoiceNumber.length > 0;
    let invoiceNumber =
      explicitInvoiceNumber || (await nextInvoiceNumber(tenantDbId));

    // Auto-link quote/estimate using explicit quote fields first, then invoice number.
    let estimateId = null;
    let quoteId = submittedQuoteId || null;
    let quoteNumber = submittedQuoteNumber || "";
    let linkedClientId = normalizeUuid(body.clientId);

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

    const quoteLookupNumber = quoteNumber || invoiceNumber;
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

    const estimateLookupNumber = quoteNumber || invoiceNumber;
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

    if (!linkedClientId && String(body.clientName || "").trim()) {
      const resolved = await resolveClientForInvoiceParty(
        supabaseAdmin,
        tenantDbId,
        {
          clientName: body.clientName,
          clientEmail: body.clientEmail,
        },
      );
      if (resolved?.id) {
        linkedClientId = normalizeUuid(resolved.id);
      }
    }

    const paymentState = computeInvoicePaymentState({
      amount,
      payments: [],
    });

    let toInsert = {
      tenant_id: tenantDbId,
      user_id: userId || null,
      invoice_number: invoiceNumber,
      invoice_title: String(body.invoiceTitle || "").trim(),
      job_id: normalizeUuid(body.jobId),
      client_id: linkedClientId,
      client_name: String(body.clientName || "").trim(),
      client_email: String(body.clientEmail || "").trim(),
      client_phone: "",
      client_address: "",
      property_address: "",
      amount,
      due_date: normalizeTimestamp(body.dueDate),
      items: lineItems,
      subtotal_cents: amountCents,
      tax_cents: 0,
      total_cents: amountCents,
      notes: String(body.notes || "").trim(),
      preferred_payment_method: normalizePaymentMethod(
        body.preferredPaymentMethod,
      ),
      payments: paymentState.payments,
      paid_amount: paymentState.paidAmount,
      balance_due: paymentState.balanceDue,
      status: paymentState.status,
      created_by: userId || null,
      created_at: nowIso,
      updated_at: nowIso,
      estimate_id: estimateId,
      quote_id: quoteId,
      quote_number: quoteNumber,
    };

    toInsert = await attachFreshPartyFieldsToInvoiceRow(
      supabaseAdmin,
      tenantDbId,
      toInsert,
      {
        clientId: linkedClientId,
        clientName: body.clientName,
        clientEmail: body.clientEmail,
      },
    );

    // Retry-on-23505 only when the invoice number was auto-allocated.
    // Caller-provided numbers do NOT retry: a unique violation there
    // should bubble back to the caller as a 409 so they can pick a
    // different number.
    let insertedInvoice = null;
    let lastInsertError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const insertResult = await supabaseAdmin
        .from(INVOICES)
        .insert(toInsert)
        .select("*")
        .single();

      if (!insertResult.error) {
        insertedInvoice = insertResult.data;
        lastInsertError = null;
        break;
      }

      lastInsertError = insertResult.error;
      const code = String(insertResult.error.code || "");
      const msg = String(insertResult.error.message || "");
      const isUniqueViolation =
        code === "23505" || /duplicate key value/i.test(msg);

      if (!isUniqueViolation || hasExplicitInvoiceNumber) break;

      // Auto-allocated collision: recompute and try again. Don't
      // mutate `toInsert` apart from the number — caller-visible
      // shape stays identical.
      invoiceNumber = await nextInvoiceNumber(tenantDbId);
      toInsert.invoice_number = invoiceNumber;
    }

    if (lastInsertError) {
      logSupabaseError("[api/invoices][POST] Supabase insert error", lastInsertError, {
        tenantDbId,
        userId,
        toInsert,
      });
      const code = String(lastInsertError.code || "");
      const msg = String(lastInsertError.message || "");
      const isUniqueViolation =
        code === "23505" || /duplicate key value/i.test(msg);
      if (isUniqueViolation && hasExplicitInvoiceNumber) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invoice number "${invoiceNumber}" is already in use for this tenant.`,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(lastInsertError.message);
    }
    if (!insertedInvoice) {
      throw new Error("Failed to allocate a unique invoice number");
    }

    return new Response(
      JSON.stringify({ success: true, data: serialize(insertedInvoice) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/invoices][POST] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
