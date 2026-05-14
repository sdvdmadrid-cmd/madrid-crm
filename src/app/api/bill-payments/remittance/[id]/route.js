import {
  BILL_PAYMENT_TRANSACTION_TABLE,
  requireBillPaymentsAccess,
  serializeBillPaymentTransaction,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUuid } from "@/lib/supabase-db";

export async function PATCH(request, { params }) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;
  const { context } = access;

  const transactionId = normalizeUuid(params?.id);
  if (!transactionId) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid transaction ID" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const remittanceReference = String(body.remittanceReference || "").trim();
  const remittanceStatus = String(body.remittanceStatus || "submitted").trim();

  const allowed = ["submitted", "failed", "pending_submission"];
  if (!allowed.includes(remittanceStatus)) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid remittance status" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data: transaction, error: fetchError } = await supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .select("*")
    .eq("id", transactionId)
    .eq("tenant_id", context.tenantDbId)
    .maybeSingle();

  if (fetchError) {
    return new Response(
      JSON.stringify({ success: false, error: fetchError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!transaction) {
    return new Response(
      JSON.stringify({ success: false, error: "Transaction not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const existingMeta =
    transaction.metadata && typeof transaction.metadata === "object"
      ? transaction.metadata
      : {};

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .update({
      metadata: {
        ...existingMeta,
        remittance_status: remittanceStatus,
        remittance_reference: remittanceReference,
        remittance_submitted_at: remittanceStatus === "submitted" ? nowIso : (existingMeta.remittance_submitted_at || null),
        remittance_submitted_by: context.userId,
      },
      updated_at: nowIso,
    })
    .eq("id", transactionId)
    .eq("tenant_id", context.tenantDbId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return new Response(
      JSON.stringify({ success: false, error: updateError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: serializeBillPaymentTransaction(updated),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
