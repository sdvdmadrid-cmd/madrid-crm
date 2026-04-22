import {
  BILL_AUTOPAY_RULE_TABLE,
  BILL_PAYMENT_METHOD_TABLE,
  BILL_TABLE,
  buildAutopayPayload,
  requireBillPaymentsAccess,
  serializeAutopayRule,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUuid } from "@/lib/supabase-db";

export async function PUT(request, { params }) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;
  const { context } = access;
  const { id } = await params;
  const billId = normalizeUuid(id);
  if (!billId) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid bill id" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const [
    { data: bill, error: billError },
    { data: currentRule, error: ruleError },
  ] = await Promise.all([
    supabaseAdmin
      .from(BILL_TABLE)
      .select("*")
      .eq("id", billId)
      .eq("tenant_id", context.tenantDbId)
      .maybeSingle(),
    supabaseAdmin
      .from(BILL_AUTOPAY_RULE_TABLE)
      .select("*")
      .eq("bill_id", billId)
      .eq("tenant_id", context.tenantDbId)
      .maybeSingle(),
  ]);

  const firstError = billError || ruleError;
  if (firstError) {
    return new Response(
      JSON.stringify({ success: false, error: firstError.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (!bill) {
    return new Response(
      JSON.stringify({ success: false, error: "Bill not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const body = await request.json().catch(() => ({}));
  try {
    const payload = buildAutopayPayload(body, billId, currentRule);
    if (payload.payment_method_id) {
      const { data: paymentMethod, error: paymentMethodError } = await supabaseAdmin
        .from(BILL_PAYMENT_METHOD_TABLE)
        .select("id, metadata, stripe_payment_method_id")
        .eq("id", payload.payment_method_id)
        .eq("tenant_id", context.tenantDbId)
        .eq("user_id", context.userId)
        .maybeSingle();

      if (paymentMethodError) {
        throw paymentMethodError;
      }

      if (!paymentMethod) {
        throw new Error("Payment method not found");
      }

      const provider = String(paymentMethod.metadata?.provider || "").trim().toLowerCase();
      if (
        provider === "plaid" ||
        String(paymentMethod.stripe_payment_method_id || "").startsWith("plaid:")
      ) {
        throw new Error(
          "Plaid-linked accounts cannot be used for AutoPay until the payment processor bridge is enabled",
        );
      }
    }

    payload.tenant_id = context.tenantDbId;
    payload.user_id = context.userId;
    payload.created_at = currentRule?.created_at || new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from(BILL_AUTOPAY_RULE_TABLE)
      .upsert(payload, { onConflict: "bill_id" })
      .select("*")
      .maybeSingle();

    if (error) throw error;

    await supabaseAdmin
      .from(BILL_TABLE)
      .update({
        autopay_enabled: payload.enabled && !payload.paused,
        updated_at: new Date().toISOString(),
      })
      .eq("id", billId)
      .eq("tenant_id", context.tenantDbId);

    return new Response(
      JSON.stringify({ success: true, data: serializeAutopayRule(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
