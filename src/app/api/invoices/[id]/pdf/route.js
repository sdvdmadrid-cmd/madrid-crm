import { getEstimateBrandingByTenant } from "@/lib/estimate-email-branding";
import { pdfResponse } from "@/lib/document-pdf-core";
import { enrichInvoiceWithPartyInfo } from "@/lib/invoice-party";
import { buildInvoicePdfBuffer, pdfFilenameForInvoice } from "@/lib/invoice-pdf";
import {
  computeInvoicePaymentState,
  normalizePaymentMethod,
} from "@/lib/invoice-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

const INVOICES = "invoices";

function serializeInvoice(doc) {
  const amount = Number(doc.amount ?? (Number(doc.total_cents || 0) / 100 || 0));
  const base = {
    id: doc.id,
    _id: doc.id,
    tenantId: doc.tenant_id || "",
    invoiceNumber: doc.invoice_number || "",
    invoiceTitle: doc.invoice_title || "",
    clientName: doc.client_name || "",
    clientEmail: doc.client_email || "",
    clientPhone: doc.client_phone || "",
    clientAddress: doc.client_address || "",
    propertyAddress: doc.property_address || "",
    clientId: doc.client_id || "",
    amount: amount ? String(amount) : "",
    dueDate: doc.due_date ? String(doc.due_date).slice(0, 10) : "",
    lineItems: Array.isArray(doc.items) ? doc.items : [],
    notes: doc.notes || "",
    payments: Array.isArray(doc.payments) ? doc.payments : [],
    paidAmount: Number(doc.paid_amount || 0),
    balanceDue: Number(doc.balance_due || 0),
    status: doc.status || "Unpaid",
    preferredPaymentMethod: normalizePaymentMethod(doc.preferred_payment_method),
  };
  return { ...base, ...computeInvoicePaymentState(base) };
}

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) {
      return Response.json({ success: false, error: "Invalid invoice id" }, { status: 400 });
    }

    let query = supabaseAdmin.from(INVOICES).select("*").eq("id", id).maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data) {
      return Response.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    let invoice = serializeInvoice(data);
    invoice = await enrichInvoiceWithPartyInfo(
      supabaseAdmin,
      invoice.tenantId || tenantDbId,
      invoice,
    );
    const branding = await getEstimateBrandingByTenant(invoice.tenantId);
    const buffer = await buildInvoicePdfBuffer({ invoice, branding });
    const filename = pdfFilenameForInvoice(invoice);
    const download = new URL(request.url).searchParams.get("download") === "1";

    return pdfResponse(buffer, filename, { download });
  } catch (err) {
    console.error("[api/invoices/:id/pdf] error", err);
    return Response.json(
      { success: false, error: err?.message || "Failed to build PDF" },
      { status: 500 },
    );
  }
}
