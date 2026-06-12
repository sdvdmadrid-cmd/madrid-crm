import "server-only";

import {
  computeInvoicePaymentState,
  normalizePaymentMethod,
} from "@/lib/invoice-payments";
import { hydrateInvoiceDocsParty } from "@/lib/invoice-party";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import { scopeByTenant } from "@/lib/tenant-scope";
import { applyListSearchOr } from "@/lib/list-search-server";

const INVOICES = "invoices";

export const INVOICES_UI_PAGE_SIZE = 50;

export function serializeInvoiceRow(doc) {
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
    preferredPaymentMethod: normalizePaymentMethod(doc.preferred_payment_method),
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

export async function listInvoicesForTenant(
  { tenantDbId, role, page = 1, limit = INVOICES_UI_PAGE_SIZE, search = "" } = {},
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(
    100,
    Math.max(1, Number(limit) || INVOICES_UI_PAGE_SIZE),
  );
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = scopeByTenant(
    supabaseAdmin
      .from(INVOICES)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false }),
    { tenantDbId, role },
  );

  query = applyListSearchOr(
    query,
    ["client_name", "invoice_number", "invoice_title", "status"],
    search,
  );

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    logSupabaseError("[invoices-list-server] Supabase query error", error, {
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
  const docs = hydrated.map(serializeInvoiceRow);
  const total = Number(count || 0);

  return {
    data: docs,
    total,
    page: safePage,
    limit: safeLimit,
    pages: safeLimit > 0 ? Math.max(1, Math.ceil(total / safeLimit)) : 1,
  };
}
