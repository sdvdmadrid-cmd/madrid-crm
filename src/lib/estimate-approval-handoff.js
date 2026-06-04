import "server-only";

import crypto from "node:crypto";

import { parseEstimateNotes } from "@/lib/estimate-notes";
import { appendDisclaimer } from "@/lib/legal";
import {
  INVOICE_LOOKUP_LIMIT,
  formatInvoiceNumber,
  pickMaxInvoiceSequence,
} from "@/lib/invoice-number";
import {
  QUOTE_LOOKUP_LIMIT,
  normalizeBaseNumber,
  pickMaxQuoteSequence,
  toCents,
} from "@/lib/quote-numbering";
import { fetchInvoicePartyDbFields } from "@/lib/invoice-party";
import { supabaseAdmin } from "@/lib/supabase-admin";

const QUOTES_TABLE = "quotes";
const INVOICES_TABLE = "invoices";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** invoices.client_id is uuid — omit invalid/empty values to avoid Postgres cast errors. */
function invoiceClientId(raw) {
  const value = String(raw || "").trim();
  return UUID_RE.test(value) ? value : null;
}

/**
 * Materialize downstream quote + invoice rows after an estimate lands in
 * `approved`. Idempotent — safe to call from both the public respond path
 * and the contractor PATCH kanban path (F3 / F6).
 *
 * Failures throw so callers can degrade gracefully (respond already does;
 * PATCH logs a warning and still returns the approved estimate).
 */
export async function runEstimateApprovalHandoff({ estimate, nowIso }) {
  const quote = await ensureQuoteForApprovedEstimate({ estimate, nowIso });
  if (quote?.id) {
    await ensureInvoiceForApprovedEstimate({ estimate, quote, nowIso });
  }
}

/**
 * Idempotently create (or reuse) a quote row for an approved estimate.
 * Returns the quote row `{ id, quote_number, ... }` or null when skipped.
 */
async function ensureQuoteForApprovedEstimate({ estimate, nowIso }) {
  const tenantId = String(estimate.tenant_id || "").trim();
  if (!tenantId) {
    throw new Error(
      `Estimate ${estimate.id} has no tenant_id; cannot create approved quote`,
    );
  }

  const baseNumber = String(estimate.estimate_number || "").trim();
  const parsed = parseEstimateNotes(estimate.notes);
  const lineItems = Array.isArray(estimate.items) ? estimate.items : [];

  if (baseNumber) {
    const { data: existingQuote, error: existingQuoteError } =
      await supabaseAdmin
        .from(QUOTES_TABLE)
        .select("id, quote_number")
        .eq("tenant_id", tenantId)
        .eq("quote_number", baseNumber)
        .maybeSingle();

    if (existingQuoteError) {
      throw new Error(existingQuoteError.message);
    }
    if (existingQuote) return existingQuote;
  }

  let quoteNumber = baseNumber;
  if (!quoteNumber) {
    const { data: recentQuotes, error: recentQuotesError } =
      await supabaseAdmin
        .from(QUOTES_TABLE)
        .select("quote_number")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(QUOTE_LOOKUP_LIMIT);
    if (recentQuotesError) {
      throw new Error(recentQuotesError.message);
    }
    quoteNumber = String(pickMaxQuoteSequence(recentQuotes) + 1);
  }

  const quoteToken = `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;
  const scopeBase = parsed.noteText || "";

  const { data: insertedQuote, error: createQuoteError } = await supabaseAdmin
    .from(QUOTES_TABLE)
    .insert({
      tenant_id: tenantId,
      user_id: estimate.user_id || null,
      created_by: estimate.created_by || null,
      quote_number: quoteNumber,
      title: `Quote for ${estimate.client_name || "Client"}`,
      client_id: String(estimate.client_id || "").trim(),
      client_name: estimate.client_name || "",
      client_email: parsed.clientEmail || "",
      client_phone: parsed.clientPhone || "",
      address_line1: parsed.address || "",
      address_line2: "",
      city: "",
      state: "",
      zip: "",
      property_address: parsed.address || "",
      line_items: lineItems,
      scope_of_work: appendDisclaimer(scopeBase),
      status: "approved",
      quote_token: quoteToken,
      quote_shared_at: nowIso,
      sent_at: nowIso,
      approved_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id, quote_number")
    .single();

  if (createQuoteError) {
    throw new Error(createQuoteError.message);
  }

  return insertedQuote;
}

/**
 * Idempotently create an invoice linked to the quote. The `invoices`
 * table's `estimate_id` FK points at `estimate_builder` only, so rows
 * originating from the pipeline `estimates` table link via `quote_id`
 * + matching `invoice_number` instead.
 */
async function ensureInvoiceForApprovedEstimate({ estimate, quote, nowIso }) {
  const tenantId = String(estimate.tenant_id || "").trim();
  if (!tenantId) return;

  const quoteId = String(quote?.id || "").trim();
  if (!quoteId) return;

  const { data: existingByQuote, error: existingByQuoteError } =
    await supabaseAdmin
      .from(INVOICES_TABLE)
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("quote_id", quoteId)
      .maybeSingle();

  if (existingByQuoteError) {
    throw new Error(existingByQuoteError.message);
  }
  if (existingByQuote) return;

  const parsed = parseEstimateNotes(estimate.notes);
  const lineItems = Array.isArray(estimate.items) ? estimate.items : [];
  const invoiceAmount = Math.round(toNumber(estimate.total) * 100) / 100;
  const invoiceAmountCents = toCents(invoiceAmount);

  const invoiceNumber =
    normalizeBaseNumber(
      String(quote.quote_number || estimate.estimate_number || "").trim(),
    ) || (await nextInvoiceNumberForTenant(tenantId));

  const { data: existingByNumber, error: existingByNumberError } =
    await supabaseAdmin
      .from(INVOICES_TABLE)
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();

  if (existingByNumberError) {
    throw new Error(existingByNumberError.message);
  }
  if (existingByNumber) return;

  const scopeBase = parsed.noteText || "";
  const invoiceDoc = {
    tenant_id: tenantId,
    user_id: estimate.user_id || null,
    created_by: estimate.created_by || null,
    invoice_number: invoiceNumber,
    invoice_title: `Invoice for ${estimate.client_name || "Client"}`,
    quote_id: quoteId,
    quote_number: String(quote.quote_number || "").trim(),
    job_id: estimate.job_id || null,
    client_id: invoiceClientId(estimate.client_id),
    client_name: estimate.client_name || "",
    client_email: parsed.clientEmail || "",
    amount: invoiceAmount,
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    items: lineItems,
    subtotal_cents: invoiceAmountCents,
    tax_cents: toCents(Math.max(0, toNumber(estimate.tax))),
    total_cents: invoiceAmountCents,
    notes: appendDisclaimer(scopeBase),
    preferred_payment_method: "bank_transfer",
    payments: [],
    paid_amount: 0,
    balance_due: invoiceAmount,
    status: "Unpaid",
    created_at: nowIso,
    updated_at: nowIso,
    // Do not set estimate_id — FK targets estimate_builder (uuid) only; pipeline
    // estimates use integer ids and must link via quote_id + invoice_number.
  };

  if (invoiceDoc.client_id) {
    const partyFields = await fetchInvoicePartyDbFields(
      supabaseAdmin,
      tenantId,
      invoiceDoc.client_id,
      { clientEmail: invoiceDoc.client_email },
    );
    Object.assign(invoiceDoc, partyFields);
  }

  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const numberForAttempt =
      attempt === 0
        ? invoiceDoc.invoice_number
        : await nextInvoiceNumberForTenant(tenantId);

    const { error: invoiceError } = await supabaseAdmin
      .from(INVOICES_TABLE)
      .insert({ ...invoiceDoc, invoice_number: numberForAttempt });

    if (!invoiceError) return;

    lastError = invoiceError;
    const code = String(invoiceError.code || "");
    const msg = String(invoiceError.message || "");
    const isUniqueViolation = code === "23505" || /duplicate key value/i.test(msg);
    if (!isUniqueViolation) break;
  }

  if (lastError) {
    throw new Error(lastError.message);
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function nextInvoiceNumberForTenant(tenantId) {
  const { data, error } = await supabaseAdmin
    .from(INVOICES_TABLE)
    .select("invoice_number, created_at")
    .eq("tenant_id", tenantId)
    .ilike("invoice_number", "INV-%")
    .order("created_at", { ascending: false })
    .limit(INVOICE_LOOKUP_LIMIT);

  if (error) throw new Error(error.message);
  return formatInvoiceNumber(pickMaxInvoiceSequence(data) + 1);
}
