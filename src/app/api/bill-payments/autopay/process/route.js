import {
  BILL_AUTOPAY_RULE_TABLE,
  BILL_PAYMENT_METHOD_TABLE,
  BILL_TABLE,
  createNotification,
  isAutopayDue,
  processBillPayment,
  resolveAutopayAmount,
  shouldSendAutopayReminder,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request) {
  const cronSecret = String(process.env.BILL_AUTOPAY_CRON_SECRET || "").trim();
  const requestSecret = String(
    request.headers.get("x-cron-secret") || "",
  ).trim();
  if (!cronSecret || requestSecret !== cronSecret) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
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
      await processBillPayment({
        context: { tenantDbId: rule.tenant_id, userId: rule.user_id },
        bill,
        paymentMethod,
        amount,
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
