import {
  BILL_AUTOPAY_RULE_TABLE,
  BILL_PAYMENT_METHOD_TABLE,
  BILL_TABLE,
  calculateBillPaymentPricing,
  createNotification,
  isAutopayDue,
  processBillPayment,
  resolveAutopayAmount,
  shouldSendAutopayReminder,
} from "@/lib/bill-payments";
import {
  isCronAuthorized,
  unauthorizedCronResponse,
} from "@/lib/cron-auth";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CRON_ENV_KEYS = ["BILL_AUTOPAY_CRON_SECRET"];

export async function GET(request) {
  return POST(request);
}

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;
  if (!isCronAuthorized(request, CRON_ENV_KEYS)) {
    return unauthorizedCronResponse();
  }

  const { data: rules, error } = await supabaseAdmin
    .from(BILL_AUTOPAY_RULE_TABLE)
    .select("*")
    .eq("enabled", true)
    .eq("paused", false);

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let remindersSent = 0;
  let paymentsProcessed = 0;
  const failures = [];

  for (const rule of rules || []) {
    const [{ data: bill }, { data: paymentMethod }] = await Promise.all([
      supabaseAdmin
        .from(BILL_TABLE)
        .select("*")
        .eq("id", rule.bill_id)
        .eq("tenant_id", rule.tenant_id)
        .maybeSingle(),
      rule.payment_method_id
        ? supabaseAdmin
            .from(BILL_PAYMENT_METHOD_TABLE)
            .select("*")
            .eq("id", rule.payment_method_id)
            .eq("tenant_id", rule.tenant_id)
            .eq("user_id", rule.user_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!bill || !paymentMethod) {
      continue;
    }

    if (shouldSendAutopayReminder(rule, bill)) {
      await createNotification({
        tenantId: rule.tenant_id,
        userId: rule.user_id,
        type: "bill_autopay_upcoming",
        title: "Upcoming AutoPay",
        message: `${bill.provider_name} will be processed automatically soon.`,
        metadata: { billId: bill.id, autopayRuleId: rule.id },
      });
      remindersSent += 1;
      await supabaseAdmin
        .from(BILL_AUTOPAY_RULE_TABLE)
        .update({
          last_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id)
        .eq("tenant_id", rule.tenant_id);
    }

    if (!isAutopayDue(rule, bill)) {
      continue;
    }

    try {
      const amount = resolveAutopayAmount(bill, rule);
      const pricing = calculateBillPaymentPricing({
        baseAmount: amount,
        paymentMethodType: paymentMethod.method_type,
      });
      await processBillPayment({
        context: { tenantDbId: rule.tenant_id, userId: rule.user_id },
        bill,
        paymentMethod,
        amount: pricing.totalAmount,
        pricing,
        source: "autopay",
      });
      paymentsProcessed += 1;
      await supabaseAdmin
        .from(BILL_AUTOPAY_RULE_TABLE)
        .update({
          last_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id)
        .eq("tenant_id", rule.tenant_id);
    } catch (processError) {
      failures.push({ billId: bill.id, error: processError.message });
    }
  }

  return new Response(
    JSON.stringify({
      success: failures.length === 0,
      data: { remindersSent, paymentsProcessed, failures },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
