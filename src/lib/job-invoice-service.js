import "server-only";

import {
  formatInvoiceNumber,
  pickMaxInvoiceSequence,
  INVOICE_LOOKUP_LIMIT,
} from "./invoice-number.js";
import { normalizeInvoiceLineItemsForSave } from "./invoice-line-items.js";
import { computeInvoicePaymentState, normalizeMoney } from "./invoice-payments.js";
import { getJobProjectPl } from "./project-pl.js";
import { roundMoney } from "./payroll-money.js";
import { supabaseAdmin } from "./supabase-admin.js";

async function nextInvoiceNumber(tenantId) {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("invoice_number, created_at")
    .eq("tenant_id", tenantId)
    .ilike("invoice_number", "INV-%")
    .order("created_at", { ascending: false })
    .limit(INVOICE_LOOKUP_LIMIT);

  if (error) throw new Error(error.message);
  return formatInvoiceNumber(pickMaxInvoiceSequence(data) + 1);
}

/**
 * Create invoice from job P&L.
 * billingType: progress | final | change_order | full
 */
export async function createInvoiceFromJob({
  tenantDbId,
  userId,
  jobId,
  billingType = "full",
  percent = 100,
  changeOrderAmount = 0,
  notes = "",
}) {
  const pl = await getJobProjectPl(tenantDbId, jobId);
  const pct = Math.min(100, Math.max(0, Number(percent || 100))) / 100;

  let amount = 0;
  let titleSuffix = "";

  if (billingType === "change_order") {
    amount = roundMoney(Number(changeOrderAmount || 0));
    titleSuffix = "Change Order";
  } else if (billingType === "progress") {
    amount = roundMoney(pl.revenue * pct);
    titleSuffix = `Progress (${Math.round(pct * 100)}%)`;
  } else if (billingType === "final") {
    const alreadyInvoiced = pl.invoices.invoicedTotal || 0;
    amount = roundMoney(Math.max(0, pl.revenue - alreadyInvoiced));
    titleSuffix = "Final Billing";
  } else {
    amount = roundMoney(pl.revenue);
    titleSuffix = "Invoice";
  }

  if (amount <= 0) {
    throw new Error("Invoice amount must be greater than zero.");
  }

  const lineItems = normalizeInvoiceLineItemsForSave([
    {
      description: `${pl.jobTitle} — ${titleSuffix}`,
      quantity: 1,
      rate: amount,
      amount,
    },
  ]);

  const invoiceNumber = await nextInvoiceNumber(tenantDbId);
  const now = new Date().toISOString();
  const amountCents = Math.round(amount * 100);

  const row = {
    tenant_id: tenantDbId,
    user_id: userId || null,
    job_id: jobId,
    client_name: pl.clientName || "",
    invoice_number: invoiceNumber,
    invoice_title: `${pl.jobTitle} — ${titleSuffix}`,
    items: lineItems,
    amount: String(amount),
    total_cents: amountCents,
    notes: notes || "",
    internal_notes: `Generated from job P&L (${billingType})`,
    status: "Unpaid",
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const base = {
    id: data.id,
    invoiceNumber: data.invoice_number,
    amount: String(amount),
    jobId,
    clientName: pl.clientName,
    lineItems,
    status: data.status,
  };

  return {
    invoice: { ...base, ...computeInvoicePaymentState(base) },
    billingType,
    jobTitle: pl.jobTitle,
  };
}
