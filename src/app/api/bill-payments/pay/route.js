import crypto from "node:crypto";

import {
  BILL_PAYMENT_METHOD_TABLE,
  BILL_TABLE,
  processBillPayment,
  requireBillPaymentsAccess,
  serializeBillPaymentTransaction,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUuid } from "@/lib/supabase-db";

export async function POST(request) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;
  const { context } = access;
  const body = await request.json().catch(() => ({}));
  const billIds = Array.isArray(body.billIds)
    ? body.billIds.map(normalizeUuid).filter(Boolean)
    : [];

  if (billIds.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "At least one bill is required",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let paymentMethodId = normalizeUuid(body.paymentMethodId);
  if (!paymentMethodId) {
    const { data: fallbackMethod } = await supabaseAdmin
      .from(BILL_PAYMENT_METHOD_TABLE)
      .select("*")
      .eq("tenant_id", context.tenantDbId)
      .eq("user_id", context.userId)
      .eq("is_default", true)
      .maybeSingle();
    paymentMethodId = fallbackMethod?.id || null;
  }

  if (!paymentMethodId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "A saved payment method is required",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const [
    { data: paymentMethod, error: methodError },
    { data: bills, error: billsError },
  ] = await Promise.all([
    supabaseAdmin
      .from(BILL_PAYMENT_METHOD_TABLE)
      .select("*")
      .eq("id", paymentMethodId)
      .eq("tenant_id", context.tenantDbId)
      .eq("user_id", context.userId)
      .maybeSingle(),
    supabaseAdmin
      .from(BILL_TABLE)
      .select("*")
      .eq("tenant_id", context.tenantDbId)
      .in("id", billIds),
  ]);

  const firstError = methodError || billsError;
  if (firstError) {
    return new Response(
      JSON.stringify({ success: false, error: firstError.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (!paymentMethod) {
    return new Response(
      JSON.stringify({ success: false, error: "Payment method not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const bulkBatchId = billIds.length > 1 ? crypto.randomUUID() : null;
  const results = [];
  const failures = [];
  const forwardedFor = String(request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);
  const paymentContext = {
    ipAddress: forwardedFor || "127.0.0.1",
    userAgent:
      String(request.headers.get("user-agent") || "").trim() ||
      "ContractorFlow Bill Payments",
  };

  for (const bill of bills || []) {
    try {
      const transaction = await processBillPayment({
        context,
        bill,
        paymentMethod,
        amount: Number(bill.amount_due || 0),
        source: billIds.length > 1 ? "bulk" : "manual",
        bulkBatchId,
        paymentContext,
      });
      results.push(serializeBillPaymentTransaction(transaction));
    } catch (error) {
      failures.push({ billId: bill.id, error: error.message });
    }
  }

  return new Response(
    JSON.stringify({
      success: failures.length === 0,
      data: { transactions: results, failures, bulkBatchId },
    }),
    {
      status: failures.length > 0 ? 207 : 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
