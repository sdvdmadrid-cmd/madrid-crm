import crypto from "node:crypto";
import {
  QUOTE_LOOKUP_LIMIT,
  normalizeBaseNumber,
  pickMaxQuoteSequence,
  toCents,
} from "@/lib/quote-numbering";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canSendExternal,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ESTIMATES_COL = "estimate_builder";
const QUOTES_COL = "quotes";
const CLIENTS_COL = "clients";

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the next sequential quote number for a tenant. Uses MAX(numeric
 * suffix) + 1 instead of `COUNT(*) + 1` so soft-deleted/migrated rows
 * don't reset the sequence. Wrapped in a retry loop at the call-site to
 * survive concurrent promotes — two contractors clicking "promote" at the
 * same time will hit a unique-violation on insert and we re-derive the
 * next number.
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
      "[api/estimate-builder/:id/promote] Supabase quote count error",
      error,
    );
    throw new Error(error.message);
  }

  return String(pickMaxQuoteSequence(data) + 1);
}

function serializeQuote(doc) {
  return {
    _id: doc.id,
    id: doc.id,
    quoteNumber: doc.quote_number || "",
    title: doc.title || "",
    clientId: doc.client_id || "",
    clientName: doc.client_name || "",
    clientEmail: doc.client_email || "",
    clientPhone: doc.client_phone || "",
    addressLine1: doc.address_line1 || "",
    addressLine2: doc.address_line2 || "",
    city: doc.city || "",
    state: doc.state || "",
    zip: doc.zip || "",
    propertyAddress: doc.property_address || "",
    lineItems: Array.isArray(doc.line_items) ? doc.line_items : [],
    scopeOfWork: doc.scope_of_work || "",
    status: doc.status || "draft",
    quoteToken: doc.quote_token || null,
    quoteSharedAt: doc.quote_shared_at || null,
    estimateId: doc.estimate_id || null,
    sentAt: doc.sent_at || null,
    viewedAt: doc.viewed_at || null,
    emailOpenedAt: doc.email_opened_at || null,
    approvedAt: doc.approved_at || null,
    createdAt: doc.created_at || null,
    updatedAt: doc.updated_at || null,
  };
}

/**
 * POST /api/estimate-builder/[id]/promote
 *
 * Creates a Quote + Invoice from the estimate and returns the public quote.
 *
 * Body: {} — no body required; the estimate is read from DB by [id].
 *
 * Returns: { success: true, quote: <serialized quote> }
 */
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

    const { id } = await params;
    if (!id) {
      return Response.json(
        { success: false, error: "Invalid estimate id" },
        { status: 400 },
      );
    }

    // ── 1. Load the estimate ────────────────────────────────────────────────
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
        "[api/estimate-builder/:id/promote] Supabase estimate query error",
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

    const estimateClientId = String(
      estimate.client_id || estimate.clientId || "",
    ).trim();

    if (!estimateClientId) {
      return Response.json(
        { success: false, error: "Estimate has no client assigned" },
        { status: 422 },
      );
    }

    // ── 2. Load the client ──────────────────────────────────────────────────
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
        "[api/estimate-builder/:id/promote] Supabase client query error",
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

    if (!clientDoc.email) {
      return Response.json(
        { success: false, error: "Client has no email address on file" },
        { status: 422 },
      );
    }

    // ── 3. Map estimate lines → quote lineItems ─────────────────────────────
    // Line totals are rounded to cents to avoid float-precision drift
    // (12.34 * 3 yields 37.019999999999996 in JS) which then propagates
    // into invoice cent columns below.
    const lineItems = (estimate.lines || []).map((l, idx) => {
      const qty = Number(l.qty) || 1;
      const unit = Number(l.finalPrice) || 0;
      const total = Math.round(qty * unit * 100) / 100;
      return {
        id: l.serviceId || `li-${idx}`,
        name: l.name || "",
        description: l.name || "",
        qty,
        unitPrice: unit,
        total,
      };
    });
    const invoiceAmount =
      Math.round(
        lineItems.reduce((sum, li) => sum + Number(li.total || 0), 0) * 100,
      ) / 100;
    const invoiceAmountCents = toCents(invoiceAmount);

    const nowIso = new Date().toISOString();
    const reusedBaseNumber = normalizeBaseNumber(
      estimate.quote_number || estimate.quoteNumber,
    );
    const quoteToken = `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;
    const baseUrl = (process.env.APP_BASE_URL || new URL(request.url).origin)
      .replace(/\/$/, "");
    const quoteUrl = `${baseUrl}/quote/${quoteToken}`;

    // ── 4. Create the Quote ─────────────────────────────────────────────────
    // Retry on unique violation so two simultaneous promotes don't both
    // grab `quote_number = 17`. When `reusedBaseNumber` is present (the
    // estimate already has a quote number assigned), use it for the first
    // attempt only; subsequent retries fall through to a freshly computed
    // sequential number.
    let insertedQuote = null;
    let insertError = null;
    let baseNumber = reusedBaseNumber || (await nextQuoteNumber(tenantDbId));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        baseNumber = await nextQuoteNumber(tenantDbId);
      }
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
        // Clients store a single address field; quotes keep the expanded structure.
        address_line1: clientDoc.address || "",
        address_line2: "",
        city: "",
        state: "",
        zip: "",
        property_address: clientDoc.address || "",
        line_items: lineItems,
        scope_of_work: estimate.notes || estimate.description || "",
        status: "sent",
        sent_at: nowIso,
        viewed_at: null,
        email_opened_at: null,
        approved_at: null,
        quote_token: quoteToken,
        quote_shared_at: nowIso,
        // Back-reference to the source estimate
        estimate_id: id,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const insertResult = await supabaseAdmin
        .from(QUOTES_COL)
        .insert(quoteDoc)
        .select("*")
        .single();

      if (!insertResult.error) {
        insertedQuote = insertResult.data;
        insertError = null;
        break;
      }
      insertError = insertResult.error;
      const code = String(insertResult.error.code || "");
      const msg = String(insertResult.error.message || "");
      const isUniqueViolation = code === "23505" || /duplicate key value/i.test(msg);
      if (!isUniqueViolation) break;
    }

    if (!insertedQuote) {
      console.error(
        "[api/estimate-builder/:id/promote] Supabase quote insert error",
        insertError,
      );
      throw new Error(
        insertError?.message || "Failed to allocate a unique quote number",
      );
    }

    await supabaseAdmin
      .from(ESTIMATES_COL)
      .update({
        quote_number: baseNumber,
        quote_id: insertedQuote.id,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("tenant_id", tenantDbId);

    // ── 5. Create the Invoice ───────────────────────────────────────────────
    const invoiceNumber = baseNumber;
    const { data: existingInvoice, error: existingInvoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("tenant_id", tenantDbId)
      .eq("estimate_id", id)
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();

    if (existingInvoiceError) {
      console.error(
        "[api/estimate-builder/:id/promote] Supabase existing invoice query error",
        existingInvoiceError,
      );
      throw new Error(existingInvoiceError.message);
    }

    if (existingInvoice) {
      return Response.json(
        { success: true, quote: serializeQuote(insertedQuote), invoice: existingInvoice },
        { status: 200 },
      );
    }

    const invoiceDoc = {
      tenant_id: tenantDbId,
      user_id: userId || null,
      created_by: userId || null,
      invoice_number: invoiceNumber,
      invoice_title: `Invoice for ${insertedQuote.title || "Estimate"}`,
      job_id: null, // No job linked yet
      client_id: insertedQuote.client_id,
      client_name: insertedQuote.client_name,
      client_email: insertedQuote.client_email,
      amount: invoiceAmount,
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      items: lineItems,
      subtotal_cents: invoiceAmountCents,
      tax_cents: 0,
      total_cents: invoiceAmountCents,
      notes: insertedQuote.scope_of_work || "",
      preferred_payment_method: null,
      payments: [],
      paid_amount: 0,
      balance_due: invoiceAmount,
      status: "Unpaid",
      created_at: nowIso,
      updated_at: nowIso,
      estimate_id: id,
      quote_id: insertedQuote.id,
    };

    const { data: insertedInvoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .insert(invoiceDoc)
      .select("*")
      .single();

    if (invoiceError) {
      console.error(
        "[api/estimate-builder/:id/promote] Supabase invoice insert error",
        invoiceError,
      );
      throw new Error(invoiceError.message);
    }

    // ── 6. Return the response ──────────────────────────────────────────────
    return Response.json(
      { success: true, quote: serializeQuote(insertedQuote), invoice: insertedInvoice },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/estimate-builder/:id/promote] error", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
