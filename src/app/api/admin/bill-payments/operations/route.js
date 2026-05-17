import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  BILL_AUTOPAY_RULE_TABLE,
  BILL_PAYMENT_METHOD_TABLE,
  BILL_PAYMENT_REMITTANCE_QUEUE_TABLE,
  BILL_PAYMENT_TRANSACTION_TABLE,
  BILL_PLATFORM_FEE_TABLE,
  BILL_PROVIDER_TABLE,
  BILL_TABLE,
  calculateBillPaymentPricing,
  createNotification,
  isAutopayDue,
  processBillPayment,
  processBillPaymentRemittanceQueue,
  processBillPaymentsMonthlyPlatformFees,
  resolveAutopayAmount,
  shouldSendAutopayReminder,
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

function resolveChargeMonth(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function countRows(table, filters = []) {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  for (const filter of filters) {
    if (!filter) continue;
    if (filter.op === "eq") query = query.eq(filter.key, filter.value);
    if (filter.op === "in") query = query.in(filter.key, filter.value);
  }
  const { count } = await query;
  return Number(count || 0);
}

async function runAutopayBatch({ dryRun = false } = {}) {
  const { data: rules, error } = await supabaseAdmin
    .from(BILL_AUTOPAY_RULE_TABLE)
    .select("*")
    .eq("enabled", true)
    .eq("paused", false);

  if (error) {
    throw new Error(error.message);
  }

  let remindersSent = 0;
  let paymentsProcessed = 0;
  let skipped = 0;
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
      skipped += 1;
      continue;
    }

    if (shouldSendAutopayReminder(rule, bill)) {
      if (!dryRun) {
        await createNotification({
          tenantId: rule.tenant_id,
          userId: rule.user_id,
          type: "bill_autopay_upcoming",
          title: "Upcoming AutoPay",
          message: `${bill.provider_name} will be processed automatically soon.`,
          metadata: { billId: bill.id, autopayRuleId: rule.id },
        });

        await supabaseAdmin
          .from(BILL_AUTOPAY_RULE_TABLE)
          .update({
            last_notified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", rule.id)
          .eq("tenant_id", rule.tenant_id);
      }
      remindersSent += 1;
    }

    if (!isAutopayDue(rule, bill)) {
      skipped += 1;
      continue;
    }

    try {
      const amount = resolveAutopayAmount(bill, rule);
      const pricing = calculateBillPaymentPricing({
        baseAmount: amount,
        paymentMethodType: paymentMethod.method_type,
      });

      if (!dryRun) {
        await processBillPayment({
          context: { tenantDbId: rule.tenant_id, userId: rule.user_id },
          bill,
          paymentMethod,
          amount: pricing.totalAmount,
          pricing,
          source: "autopay",
        });

        await supabaseAdmin
          .from(BILL_AUTOPAY_RULE_TABLE)
          .update({
            last_processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", rule.id)
          .eq("tenant_id", rule.tenant_id);
      }

      paymentsProcessed += 1;
    } catch (processError) {
      failures.push({ billId: bill.id, error: processError.message });
    }
  }

  return {
    candidates: (rules || []).length,
    remindersSent,
    paymentsProcessed,
    skipped,
    dryRun,
    failures,
  };
}

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  try {
    const currentMonth = resolveChargeMonth();

    const [
      pendingQueueCount,
      failedQueueCount,
      processingTxCount,
      paidTxCount,
      failedTxCount,
      platformFeeFailedCount,
      providerCount,
      { data: recentQueue },
      { data: recentTransactions },
      { data: recentPlatformFees },
    ] = await Promise.all([
      countRows(BILL_PAYMENT_REMITTANCE_QUEUE_TABLE, [{ op: "eq", key: "status", value: "pending_submission" }]),
      countRows(BILL_PAYMENT_REMITTANCE_QUEUE_TABLE, [{ op: "eq", key: "status", value: "failed" }]),
      countRows(BILL_PAYMENT_TRANSACTION_TABLE, [{ op: "eq", key: "status", value: "processing" }]),
      countRows(BILL_PAYMENT_TRANSACTION_TABLE, [{ op: "eq", key: "status", value: "paid" }]),
      countRows(BILL_PAYMENT_TRANSACTION_TABLE, [{ op: "eq", key: "status", value: "failed" }]),
      countRows(BILL_PLATFORM_FEE_TABLE, [
        { op: "eq", key: "charge_month", value: currentMonth },
        { op: "eq", key: "status", value: "failed" },
      ]),
      countRows(BILL_PROVIDER_TABLE),
      supabaseAdmin
        .from(BILL_PAYMENT_REMITTANCE_QUEUE_TABLE)
        .select("id, tenant_id, bill_id, transaction_id, provider_name, status, attempts, next_attempt_at, remittance_reference, updated_at")
        .order("updated_at", { ascending: false })
        .limit(40),
      supabaseAdmin
        .from(BILL_PAYMENT_TRANSACTION_TABLE)
        .select("id, tenant_id, bill_id, provider_name, amount, currency, status, source, created_at, processed_at, metadata")
        .order("created_at", { ascending: false })
        .limit(40),
      supabaseAdmin
        .from(BILL_PLATFORM_FEE_TABLE)
        .select("id, tenant_id, user_id, charge_month, amount, status, failure_reason, updated_at")
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          pendingQueueCount,
          failedQueueCount,
          processingTxCount,
          paidTxCount,
          failedTxCount,
          platformFeeFailedCount,
          providerCount,
          currentMonth,
        },
        recentQueue: recentQueue || [],
        recentTransactions: recentTransactions || [],
        recentPlatformFees: recentPlatformFees || [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load operations data" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const operation = String(body.operation || "").trim().toLowerCase();
  const dryRun = body.dryRun === true;

  try {
    if (operation === "remittance") {
      const summary = await processBillPaymentRemittanceQueue({
        limit: Number(body.limit || 25),
        dryRun,
        providerName: String(body.providerName || "").trim(),
      });
      return NextResponse.json({ success: true, data: summary });
    }

    if (operation === "autopay") {
      const summary = await runAutopayBatch({ dryRun });
      return NextResponse.json({ success: true, data: summary });
    }

    if (operation === "platform_fee") {
      const summary = await processBillPaymentsMonthlyPlatformFees({
        chargeMonth: String(body.chargeMonth || "").trim(),
        dryRun,
      });
      return NextResponse.json({ success: true, data: summary });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported operation" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to run operation" },
      { status: 500 },
    );
  }
}
