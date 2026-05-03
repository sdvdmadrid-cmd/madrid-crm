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
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const INVOICES = "invoices";

function normalizeBaseNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const stripped = raw.replace(/^(EST|QT|INV)[-_\s]*/i, "").trim();
  const compact = stripped.replace(/\s+/g, "");
  return compact || raw;
}

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

async function nextInvoiceNumber(tenantId) {
  const { count, error } = await supabaseAdmin
    .from(INVOICES)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) {
    logSupabaseError("[api/invoices] nextInvoiceNumber query error", error, {
      tenantId,
    });
    throw new Error(error.message);
  }

  return `INV-${String(Number(count || 0) + 1).padStart(4, "0")}`;
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") || 0));
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get("limit") || 0)),
    );
    const paginate = searchParams.has("page") || searchParams.has("limit");

    let query = supabaseAdmin
      .from(INVOICES)
      .select("*", { count: paginate ? "exact" : undefined })
      .order("created_at", { ascending: false });

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    if (paginate) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;
    if (error) {
      logSupabaseError("[api/invoices][GET] Supabase query error", error, {
        tenantDbId,
        role,
      });
      throw new Error(error.message);
    }

    const docs = (data || []).map(serialize);

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
    const lineItems = Array.isArray(body.lineItems) ? body.lineItems : [];
    const amount = normalizeMoney(body.amount);
    const amountCents = Math.round(amount * 100);

    const invoiceNumber =
      normalizeBaseNumber(body.invoiceNumber) ||
      (await nextInvoiceNumber(tenantDbId));

    // Auto-link by shared base number
    let estimateId = null;
    let quoteId = null;
    let linkedClientId = normalizeUuid(body.clientId);
    if (invoiceNumber) {
      const { data: est, error: estErr } = await supabaseAdmin
        .from("estimate_builder")
        .select("id,quote_number,client_id")
        .eq("tenant_id", tenantDbId)
        .eq("quote_number", invoiceNumber)
        .maybeSingle();

      if (!estErr && est?.id) {
        estimateId = est.id;
        linkedClientId = linkedClientId || normalizeUuid(est.client_id);
      }

      const { data: quote, error: quoteErr } = await supabaseAdmin
        .from("quotes")
        .select("id,client_id")
        .eq("tenant_id", tenantDbId)
        .eq("quote_number", invoiceNumber)
        .maybeSingle();

      if (!quoteErr && quote?.id) {
        quoteId = quote.id;
        linkedClientId = linkedClientId || normalizeUuid(quote.client_id);
      }
    }

    const paymentState = computeInvoicePaymentState({
      amount,
      payments: [],
    });

    const toInsert = {
      tenant_id: tenantDbId,
      user_id: userId || null,
      invoice_number: invoiceNumber,
      invoice_title: String(body.invoiceTitle || "").trim(),
      job_id: normalizeUuid(body.jobId),
      client_id: linkedClientId,
      client_name: String(body.clientName || "").trim(),
      client_email: String(body.clientEmail || "").trim(),
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
    };

    const { data, error } = await supabaseAdmin
      .from(INVOICES)
      .insert(toInsert)
      .select("*")
      .single();

    if (error) {
      logSupabaseError("[api/invoices][POST] Supabase insert error", error, {
        tenantDbId,
        userId,
        toInsert,
      });
      throw new Error(error.message);
    }

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
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
