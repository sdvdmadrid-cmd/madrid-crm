import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  BILL_PAYMENT_REMITTANCE_QUEUE_TABLE,
  BILL_PAYMENT_TRANSACTION_TABLE,
  BILL_TABLE,
  serializeBillPaymentTransaction,
} from "@/lib/bill-payments";
import { verifySessionToken } from "@/lib/auth";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

function normalizeRole(session) {
  return String(session?.role || "").toLowerCase();
}

async function requireSuperAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);
  if (!session || normalizeRole(session) !== "super_admin") {
    return null;
  }
  return session;
}

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const transactionId = String(body.transactionId || "").trim();
  const tenantId = String(body.tenantId || "").trim();
  const remittanceReference = String(body.remittanceReference || "").trim();
  const remittanceStatus = String(body.remittanceStatus || "submitted").trim();

  const allowed = ["submitted", "failed", "pending_submission"];
  if (!transactionId || !tenantId) {
    return NextResponse.json(
      { success: false, error: "transactionId and tenantId are required" },
      { status: 400 },
    );
  }
  if (!allowed.includes(remittanceStatus)) {
    return NextResponse.json(
      { success: false, error: "Invalid remittance status" },
      { status: 400 },
    );
  }

  const { data: transaction, error: fetchError } = await supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .select("*")
    .eq("id", transactionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
  }
  if (!transaction) {
    return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
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
        remittance_submitted_at:
          remittanceStatus === "submitted"
            ? nowIso
            : existingMeta.remittance_submitted_at || null,
        remittance_submitted_by: session.userId,
      },
      updated_at: nowIso,
    })
    .eq("id", transactionId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }

  const existingQueueMeta =
    updated?.metadata && typeof updated.metadata === "object"
      ? updated.metadata
      : {};

  await supabaseAdmin
    .from(BILL_PAYMENT_REMITTANCE_QUEUE_TABLE)
    .update({
      status: remittanceStatus,
      remittance_reference: remittanceReference,
      submitted_at: remittanceStatus === "submitted" ? nowIso : null,
      submitted_by: remittanceStatus === "submitted" ? session.userId : null,
      updated_at: nowIso,
      metadata: {
        ...existingQueueMeta,
        remittance_status: remittanceStatus,
        remittance_reference: remittanceReference,
      },
    })
    .eq("tenant_id", tenantId)
    .eq("transaction_id", transactionId);

  if (remittanceStatus === "submitted") {
    await supabaseAdmin
      .from(BILL_TABLE)
      .update({
        status: "paid",
        last_paid_at: nowIso,
        last_payment_id: transactionId,
        updated_at: nowIso,
      })
      .eq("tenant_id", tenantId)
      .eq("id", transaction.bill_id);
  }

  return NextResponse.json({
    success: true,
    data: serializeBillPaymentTransaction(updated),
  });
}
