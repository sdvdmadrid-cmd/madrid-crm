import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { appendDisclaimer } from "@/lib/legal";
import { enforceLegalAcceptance } from "@/lib/legal-enforcement";
import {
  QUOTE_LOOKUP_LIMIT,
  normalizeBaseNumber,
  pickMaxQuoteSequence,
  toCents,
} from "@/lib/quote-numbering";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  canSendExternal,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ESTIMATES_COL = "estimate_builder";
const QUOTES_COL = "quotes";
const INVOICES_COL = "invoices";
const CLIENTS_COL = "clients";

function buildQuoteUrl(request, quoteToken) {
  const baseUrl = (process.env.APP_BASE_URL || new URL(request.url).origin)
    .replace(/\/$/, "");
  return `${baseUrl}/quote/${quoteToken}`;
}

function serializeQuote(doc) {
  return {
    _id: doc.id,
    id: doc.id,
    quoteNumber: doc.quote_number || "",
    title: doc.title || "",
    quoteToken: doc.quote_token || null,
    clientName: doc.client_name || "",
    clientEmail: doc.client_email || "",
    clientPhone: doc.client_phone || "",
    estimateId: doc.estimate_id || null,
    createdAt: doc.created_at || null,
    updatedAt: doc.updated_at || null,
  };
}

/**
 * Compute the next sequential quote number for a tenant via
 * MAX(numeric suffix) + 1, backed by the partial unique index on
 * (tenant_id, quote_number) from
 * 20260606100000_quote_invoice_number_uniqueness.sql. Callers
 * retry on a unique-violation since two simultaneous requests can
 * still race past the read.
 *
 * The pure parsing logic (pickMaxQuoteSequence) lives in
 * src/lib/quote-numbering.js so the same numbering scheme is
 * applied identically by /promote and (transitively, see
 * /respond's ensureQuoteForApprovedEstimate fallback).
 */
async function nextQuoteNumber(tenantId) {
  const { data, error } = await supabaseAdmin
    .from(QUOTES_COL)
    .select("quote_number")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(QUOTE_LOOKUP_LIMIT);

  if (error) {
    console.error(
      "[api/estimate-builder/:id/share-link] Supabase quote count error",
      error,
    );
    throw new Error(error.message);
  }

  return String(pickMaxQuoteSequence(data) + 1);
}

export async function POST(request, { params }) {
  try {
    const csrf = enforceSameOriginForMutation(request);
    if (csrf) return csrf;

    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canSendExternal(role)) {
      return forbiddenResponse();
    }

    const legalResponse = await enforceLegalAcceptance(
      request,
      userId,
      tenantDbId,
    );
    if (legalResponse) {
      return legalResponse;
    }

    const body = await request.json().catch(() => ({}));
    const ensureInvoice = body?.ensureInvoice === true;

    const { id } = await params;
    if (!id) {
      return Response.json(
        { success: false, error: "Invalid estimate id" },
        { status: 400 },
      );
    }

    let estimateQuery = supabaseAdmin
      .from(ESTIMATES_COL)
      .select("*")
      .eq("id", id);

    if ((role || "").toLowerCase() !== "super_admin") {
      estimateQuery = estimateQuery.eq("tenant_id", tenantDbId);
    }

    const { data: estimate, error: estimateError } =
      await estimateQuery.maybeSingle();
    if (estimateError) {
      console.error(
        "[api/estimate-builder/:id/share-link] Supabase estimate query error",
        estimateError,
      );
      throw new Error(estimateError.message);
    }

    if (!estimate) {
      return Response.json(
        { success: false, error: "Estimate not found" },
        { status: 404 },
      );
    }

    const estimateQuoteId = String(estimate.quote_id || "").trim();
    const estimateQuoteNumber = String(
      estimate.quote_number || estimate.quoteNumber || "",
    ).trim();

    let existingQuote = null;
    if (estimateQuoteId) {
      let existingQuoteByIdQuery = supabaseAdmin
        .from(QUOTES_COL)
        .select("*")
        .eq("id", estimateQuoteId)
        .maybeSingle();

      if ((role || "").toLowerCase() !== "super_admin") {
        existingQuoteByIdQuery = existingQuoteByIdQuery.eq("tenant_id", tenantDbId);
      }

      const { data: existingQuoteById, error: existingQuoteByIdError } =
        await existingQuoteByIdQuery;
      if (existingQuoteByIdError) {
        console.error(
          "[api/estimate-builder/:id/share-link] Supabase quote by id query error",
          existingQuoteByIdError,
        );
        throw new Error(existingQuoteByIdError.message);
      }

      existingQuote = existingQuoteById || null;
    }

    if (!existingQuote && estimateQuoteNumber) {
      let existingQuoteByNumberQuery = supabaseAdmin
        .from(QUOTES_COL)
        .select("*")
        .eq("quote_number", estimateQuoteNumber)
        .order("created_at", { ascending: false })
        .limit(1);

      if ((role || "").toLowerCase() !== "super_admin") {
        existingQuoteByNumberQuery = existingQuoteByNumberQuery.eq("tenant_id", tenantDbId);
      }

      const { data: existingQuoteByNumberRows, error: existingQuoteByNumberError } =
        await existingQuoteByNumberQuery;
      if (existingQuoteByNumberError) {
        console.error(
          "[api/estimate-builder/:id/share-link] Supabase quote by number query error",
          existingQuoteByNumberError,
        );
        throw new Error(existingQuoteByNumberError.message);
      }

      existingQuote = Array.isArray(existingQuoteByNumberRows)
        ? existingQuoteByNumberRows[0] || null
        : null;
    }

    if (existingQuote?.quote_token) {
      if (ensureInvoice) {
        const invoiceNumber = normalizeBaseNumber(
          existingQuote.quote_number || existingQuote.id,
        );
        const { data: existingInvoice, error: existingInvoiceError } = await supabaseAdmin
          .from(INVOICES_COL)
          .select("id")
          .eq("tenant_id", tenantDbId)
          .eq("estimate_id", id)
          .eq("invoice_number", invoiceNumber)
          .maybeSingle();

        if (existingInvoiceError) {
          console.error(
            "[api/estimate-builder/:id/share-link] Supabase existing invoice query error",
            existingInvoiceError,
          );
          throw new Error(existingInvoiceError.message);
        }

        if (!existingInvoice) {
          const existingLineItems = Array.isArray(existingQuote.line_items)
            ? existingQuote.line_items
            : [];
          const invoiceAmount =
            Math.round(
              existingLineItems.reduce(
                (sum, item) => sum + Number(item?.total || 0),
                0,
              ) * 100,
            ) / 100;
          const invoiceAmountCents = toCents(invoiceAmount);
          const nowIso = new Date().toISOString();

          const { error: createInvoiceError } = await supabaseAdmin
            .from(INVOICES_COL)
            .insert({
              tenant_id: tenantDbId,
              user_id: userId || null,
              created_by: userId || null,
              invoice_number: invoiceNumber,
              invoice_title: `Invoice for ${existingQuote.title || "Estimate"}`,
              job_id: null,
              client_id: existingQuote.client_id || null,
              client_name: existingQuote.client_name || "",
              client_email: existingQuote.client_email || "",
              amount: invoiceAmount,
              due_date: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              ).toISOString(),
              items: existingLineItems,
              subtotal_cents: invoiceAmountCents,
              tax_cents: 0,
              total_cents: invoiceAmountCents,
              notes: appendDisclaimer(existingQuote.scope_of_work || ""),
              preferred_payment_method: "",
              payments: [],
              paid_amount: 0,
              balance_due: invoiceAmount,
              status: "Unpaid",
              created_at: nowIso,
              updated_at: nowIso,
              estimate_id: id,
            });

          if (createInvoiceError) {
            console.error(
              "[api/estimate-builder/:id/share-link] Supabase invoice insert error",
              createInvoiceError,
            );
            throw new Error(createInvoiceError.message);
          }
        }
      }

      return Response.json(
        {
          success: true,
          data: {
            created: false,
            quote: serializeQuote(existingQuote),
            quoteUrl: buildQuoteUrl(request, existingQuote.quote_token),
          },
        },
        { status: 200 },
      );
    }

    const estimateClientId = String(
      estimate.client_id || estimate.clientId || "",
    ).trim();
    if (!estimateClientId) {
      return Response.json(
        { success: false, error: "Estimate has no client assigned" },
        { status: 422 },
      );
    }

    let clientQuery = supabaseAdmin
      .from(CLIENTS_COL)
      .select("*")
      .eq("id", estimateClientId);

    if ((role || "").toLowerCase() !== "super_admin") {
      clientQuery = clientQuery.eq("tenant_id", tenantDbId);
    }

    const { data: clientDoc, error: clientError } =
      await clientQuery.maybeSingle();
    if (clientError) {
      console.error(
        "[api/estimate-builder/:id/share-link] Supabase client query error",
        clientError,
      );
      throw new Error(clientError.message);
    }

    if (!clientDoc) {
      return Response.json(
        { success: false, error: "Client not found" },
        { status: 422 },
      );
    }

    const lineItems = (estimate.lines || []).map((line, index) => {
      const qty = Number(line.qty) || 1;
      const unit = Number(line.finalPrice) || 0;
      const total = Math.round(qty * unit * 100) / 100;
      return {
        id: line.serviceId || `li-${index}`,
        name: line.name || "",
        description: line.name || "",
        qty,
        unitPrice: unit,
        total,
      };
    });

    const nowIso = new Date().toISOString();
    const baseNumber =
      normalizeBaseNumber(estimate.quote_number || estimate.quoteNumber) ||
      (await nextQuoteNumber(tenantDbId));
    const quoteToken = `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;
    const quoteUrl = buildQuoteUrl(request, quoteToken);
    const quoteDoc = {
      tenant_id: tenantDbId,
      user_id: userId || null,
      created_by: userId || null,
      quote_number: baseNumber,
      title: estimate.name || "Estimate",
      client_id: estimateClientId,
      client_name: clientDoc.name || "",
      client_email: clientDoc.email || "",
      client_phone: clientDoc.phone || "",
      address_line1: clientDoc.address || "",
      address_line2: "",
      city: "",
      state: "",
      zip: "",
      property_address: clientDoc.address || "",
      line_items: lineItems,
      scope_of_work: appendDisclaimer(estimate.notes || estimate.description || ""),
      status: "sent",
      sent_at: nowIso,
      viewed_at: null,
      email_opened_at: null,
      approved_at: null,
      quote_token: quoteToken,
      quote_shared_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: insertedQuote, error: insertQuoteError } = await supabaseAdmin
      .from(QUOTES_COL)
      .insert(quoteDoc)
      .select("*")
      .single();

    if (insertQuoteError) {
      console.error(
        "[api/estimate-builder/:id/share-link] Supabase quote insert error",
        insertQuoteError,
      );
      throw new Error(insertQuoteError.message);
    }

    const { error: updateEstimateError } = await supabaseAdmin
      .from(ESTIMATES_COL)
      .update({
        quote_id: insertedQuote.id,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("tenant_id", tenantDbId);

    if (updateEstimateError) {
      console.error(
        "[api/estimate-builder/:id/share-link] Supabase estimate update error",
        updateEstimateError,
      );
      // Non-fatal: quote was created, just the write-back failed
    }

    const invoiceAmount =
      Math.round(
        lineItems.reduce((sum, item) => sum + Number(item.total || 0), 0) * 100,
      ) / 100;
    const invoiceAmountCents = toCents(invoiceAmount);
    const invoiceNumber = baseNumber;
    const { data: existingInvoice, error: existingInvoiceError } = await supabaseAdmin
      .from(INVOICES_COL)
      .select("id")
      .eq("tenant_id", tenantDbId)
      .eq("estimate_id", id)
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();

    if (existingInvoiceError) {
      console.error(
        "[api/estimate-builder/:id/share-link] Supabase existing invoice query error",
        existingInvoiceError,
      );
      throw new Error(existingInvoiceError.message);
    }

    if (existingInvoice) {
      return Response.json(
        {
          success: true,
          data: {
            created: true,
            quote: serializeQuote(insertedQuote),
            quoteUrl,
          },
        },
        { status: 200 },
      );
    }

    const invoiceDoc = {
      tenant_id: tenantDbId,
      user_id: userId || null,
      created_by: userId || null,
      invoice_number: invoiceNumber,
      invoice_title: `Invoice for ${quoteDoc.title}`,
      job_id: null,
      client_id: quoteDoc.client_id,
      client_name: quoteDoc.client_name,
      client_email: quoteDoc.client_email,
      amount: invoiceAmount,
      due_date: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      items: lineItems,
      subtotal_cents: invoiceAmountCents,
      tax_cents: 0,
      total_cents: invoiceAmountCents,
      notes: appendDisclaimer(quoteDoc.scope_of_work),
      preferred_payment_method: "",
      payments: [],
      paid_amount: 0,
      balance_due: invoiceAmount,
      status: "Unpaid",
      created_at: nowIso,
      updated_at: nowIso,
      estimate_id: id,
    };

    const { error: invoiceError } = await supabaseAdmin
      .from(INVOICES_COL)
      .insert(invoiceDoc)
      .select("id")
      .single();

    if (invoiceError) {
      console.error(
        "[api/estimate-builder/:id/share-link] Supabase invoice insert error",
        invoiceError,
      );
      throw new Error(invoiceError.message);
    }

    return Response.json(
      {
        success: true,
        data: {
          created: true,
          quote: serializeQuote(insertedQuote),
          quoteUrl,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/estimate-builder/:id/share-link] error", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}