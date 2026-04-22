import crypto from "node:crypto";
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

async function nextQuoteNumber(tenantId) {
  const { count, error } = await supabaseAdmin
    .from(QUOTES_COL)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) {
    console.error(
      "[api/estimate-builder/:id/promote] Supabase quote count error",
      error,
    );
    throw new Error(error.message);
  }

  const total = Number(count || 0);
  return `QT-${String(total + 1).padStart(4, "0")}`;
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
    const lineItems = (estimate.lines || []).map((l, idx) => ({
      id: l.serviceId || `li-${idx}`,
      name: l.name || "",
      description: l.name || "",
      qty: Number(l.qty) || 1,
      unitPrice: Number(l.finalPrice) || 0,
      total: (Number(l.qty) || 1) * (Number(l.finalPrice) || 0),
    }));

    const nowIso = new Date().toISOString();
    const quoteNumber = await nextQuoteNumber(tenantDbId);
    const quoteToken = `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;
    const baseUrl = (process.env.APP_BASE_URL || new URL(request.url).origin)
      .replace(/\/$/, "");
    const quoteUrl = `${baseUrl}/quote/${quoteToken}`;

    // ── 4. Create the Quote ─────────────────────────────────────────────────
    const quoteDoc = {
      tenant_id: tenantDbId,
      user_id: userId || null,
      created_by: userId || null,
      quote_number: quoteNumber,
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

    const { data: insertedQuote, error: insertError } = await supabaseAdmin
      .from(QUOTES_COL)
      .insert(quoteDoc)
      .select("*")
      .single();

    if (insertError) {
      console.error(
        "[api/estimate-builder/:id/promote] Supabase quote insert error",
        insertError,
      );
      throw new Error(insertError.message);
    }

    const quoteId = insertedQuote.id;

    // ── 5. Create the Invoice ───────────────────────────────────────────────
    const invoiceNumber = `INV-${String(Date.now()).slice(-6)}`;
    const invoiceDoc = {
      tenant_id: tenantDbId,
      user_id: userId || null,
      created_by: userId || null,
      invoice_number: invoiceNumber,
      invoice_title: `Invoice for ${quoteDoc.title}`,
      job_id: null, // No job linked yet
      client_id: quoteDoc.client_id,
      client_name: quoteDoc.client_name,
      client_email: quoteDoc.client_email,
      amount: lineItems.reduce((sum, li) => sum + li.total, 0),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      items: lineItems,
      subtotal_cents: lineItems.reduce((sum, li) => sum + li.total, 0) * 100,
      tax_cents: 0,
      total_cents: lineItems.reduce((sum, li) => sum + li.total, 0) * 100,
      notes: quoteDoc.scope_of_work,
      preferred_payment_method: null,
      payments: [],
      paid_amount: 0,
      balance_due: lineItems.reduce((sum, li) => sum + li.total, 0),
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
