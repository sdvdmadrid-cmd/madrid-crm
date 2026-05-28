import {
  createStripeCheckoutSessionForAccess,
  getStripeSecretKey,
} from "@/lib/stripe-payments";
import {
  INVOICE_LOOKUP_LIMIT,
  formatInvoiceNumber,
  pickMaxInvoiceSequence,
} from "@/lib/invoice-number";
import { normalizeMoney } from "@/lib/invoice-payments";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError, normalizeUuid } from "@/lib/supabase-db";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const CLIENTS = "clients";
const ESTIMATES = "estimate_builder";
const INVOICES = "invoices";

export const runtime = "nodejs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isSuperAdmin(role) {
  return String(role || "").trim().toLowerCase() === "super_admin";
}

/**
 * Allocate the next INV-#### for this tenant.
 *
 * Previously this used `COUNT(*) + 1`, which had three failure modes:
 * concurrent collisions (two checkouts compute the same number),
 * deletion collisions (any deleted invoice shifts subsequent numbers
 * onto existing rows), and no retry path. We now match the
 * estimate-number scheme: MAX(numeric suffix) + 1, with the call
 * site wrapping the insert in a retry-on-23505 loop backed by the
 * partial unique index on (tenant_id, invoice_number) from
 * 20260606100000_quote_invoice_number_uniqueness.sql.
 *
 * Ordering by `created_at desc` (NOT invoice_number desc) avoids the
 * lex pitfall at the 9999 -> 10000 boundary, same as the
 * estimate-number routes.
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
    logSupabaseError(
      "[api/estimate-builder/:id/checkout] next invoice number query error",
      error,
      { tenantId },
    );
    throw new Error(error.message);
  }

  return formatInvoiceNumber(pickMaxInvoiceSequence(data) + 1);
}

function mapEstimateLinesToInvoiceItems(lines = []) {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .map((line) => {
      const quantity = Math.max(1, Number(line.qty || line.quantity || 1));
      const unitPrice = normalizeMoney(
        line.finalPrice || line.unitPrice || line.price || 0,
      );
      const total = normalizeMoney(line.total || quantity * unitPrice);

      return {
        name: String(line.name || line.title || "").trim(),
        description: String(line.description || line.name || "").trim(),
        qty: quantity,
        unitPrice,
        total,
      };
    })
    .filter((line) => line.name || line.description || line.total > 0);
}

export async function POST(request, { params }) {
  let createdInvoiceId = "";

  try {
    const csrf = enforceSameOriginForMutation(request);
    if (csrf) return csrf;

    const context = await getAuthenticatedTenantContext(request);
    if (!context.authenticated) {
      return unauthenticatedResponse();
    }

    if (!canManageSensitive(context.role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    if (!id) {
      return jsonResponse({ success: false, error: "Invalid estimate id" }, 400);
    }

    let estimateQuery = supabaseAdmin.from(ESTIMATES).select("*").eq("id", id);
    if (!isSuperAdmin(context.role)) {
      estimateQuery = estimateQuery.eq("tenant_id", context.tenantDbId);
    }

    const { data: estimate, error: estimateError } = await estimateQuery.maybeSingle();
    if (estimateError) {
      logSupabaseError(
        "[api/estimate-builder/:id/checkout] estimate query error",
        estimateError,
        { estimateId: id, tenantId: context.tenantDbId },
      );
      throw new Error(estimateError.message);
    }

    if (!estimate) {
      return jsonResponse({ success: false, error: "Estimate not found" }, 404);
    }

    const amount = normalizeMoney(
      estimate.total_final || estimate.total_mid || estimate.total_high || 0,
    );
    if (!(amount > 0)) {
      return jsonResponse(
        { success: false, error: "Estimate has no payable total" },
        400,
      );
    }

    const clientId = normalizeUuid(estimate.client_id || estimate.clientId);
    let client = null;

    if (clientId) {
      let clientQuery = supabaseAdmin.from(CLIENTS).select("*").eq("id", clientId);
      if (!isSuperAdmin(context.role)) {
        clientQuery = clientQuery.eq("tenant_id", context.tenantDbId);
      }

      const { data: clientRow, error: clientError } = await clientQuery.maybeSingle();
      if (clientError) {
        logSupabaseError(
          "[api/estimate-builder/:id/checkout] client query error",
          clientError,
          { estimateId: id, clientId, tenantId: context.tenantDbId },
        );
        throw new Error(clientError.message);
      }

      client = clientRow || null;
    }

    const nowIso = new Date().toISOString();
    const amountCents = Math.round(amount * 100);
    const lineItems = mapEstimateLinesToInvoiceItems(estimate.lines);

    // Retry-on-23505 loop, mirroring the estimate-number allocation
    // pattern. The partial unique index on
    // (tenant_id, invoice_number) added in
    // 20260606100000_quote_invoice_number_uniqueness.sql is what
    // makes the retry actually do something — without it, a
    // concurrent checkout would silently produce a duplicate
    // INV-#### instead of erroring out. We compute a fresh number
    // each attempt because the previous one may have been claimed
    // by another concurrent insert in the meantime.
    let invoice = null;
    let lastInvoiceError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invoiceNumber = await nextInvoiceNumber(context.tenantDbId);
      const insertResult = await supabaseAdmin
        .from(INVOICES)
        .insert({
          tenant_id: context.tenantDbId,
          user_id: context.userId || null,
          estimate_id: estimate.id,
          invoice_number: invoiceNumber,
          invoice_title: String(estimate.name || "Estimate invoice").trim(),
          client_id: client?.id || null,
          client_name: String(client?.name || "").trim(),
          client_email: String(client?.email || "").trim().toLowerCase(),
          amount,
          items: lineItems,
          subtotal_cents: amountCents,
          tax_cents: 0,
          total_cents: amountCents,
          notes: String(estimate.notes || "").trim(),
          preferred_payment_method: "credit_card",
          payments: [],
          paid_amount: 0,
          balance_due: amount,
          status: "Unpaid",
          created_by: context.userId || null,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .single();

      if (!insertResult.error) {
        invoice = insertResult.data;
        lastInvoiceError = null;
        break;
      }
      lastInvoiceError = insertResult.error;
      const code = String(insertResult.error.code || "");
      const msg = String(insertResult.error.message || "");
      const isUniqueViolation =
        code === "23505" || /duplicate key value/i.test(msg);
      if (!isUniqueViolation) break;
    }

    if (lastInvoiceError) {
      logSupabaseError(
        "[api/estimate-builder/:id/checkout] invoice insert error",
        lastInvoiceError,
        { estimateId: id, tenantId: context.tenantDbId, amount },
      );
      throw new Error(lastInvoiceError.message);
    }
    if (!invoice) {
      throw new Error("Failed to allocate a unique invoice number");
    }

    createdInvoiceId = String(invoice.id || "");

    if (!getStripeSecretKey()) {
      await supabaseAdmin.from(INVOICES).delete().eq("id", createdInvoiceId);
      return jsonResponse(
        { success: false, error: "Online payments are not configured" },
        503,
      );
    }

    const checkout = await createStripeCheckoutSessionForAccess({
      request,
      access: {
        context,
        invoice,
        job: null,
        client,
      },
      amount,
      source: "estimate_checkout",
    });

    if (checkout.response) {
      await supabaseAdmin.from(INVOICES).delete().eq("id", createdInvoiceId);
      return checkout.response;
    }

    return jsonResponse({
      success: true,
      data: {
        invoiceId: invoice.id,
        paymentId: checkout.paymentId,
        sessionId: checkout.sessionId,
        checkoutUrl: checkout.checkoutUrl,
        amount: checkout.payableAmount,
      },
    });
  } catch (error) {
    if (createdInvoiceId) {
      await supabaseAdmin.from(INVOICES).delete().eq("id", createdInvoiceId);
    }

    console.error("[api/estimate-builder/:id/checkout] error", error);
    return jsonResponse(
      { success: false, error: error.message || "Unable to create checkout" },
      500,
    );
  }
}