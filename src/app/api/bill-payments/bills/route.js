import {
  BILL_AUTOPAY_RULE_TABLE,
  BILL_PAYMENT_TRANSACTION_TABLE,
  BILL_TABLE,
  buildBillWritePayload,
  computeBillStatus,
  requireBillPaymentsAccess,
  serializeAutopayRule,
  serializeBill,
  serializeBillPaymentTransaction,
  updateBillStatusesForTenant,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request) {
  const access = await requireBillPaymentsAccess(request, "read");
  if (access.response) return access.response;

  const { context } = access;
  await updateBillStatusesForTenant(context.tenantDbId);

  const [
    { data: bills, error: billsError },
    { data: rules, error: rulesError },
    { data: transactions, error: transactionsError },
  ] = await Promise.all([
    supabaseAdmin
      .from(BILL_TABLE)
      .select("*")
      .eq("tenant_id", context.tenantDbId)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from(BILL_AUTOPAY_RULE_TABLE)
      .select("*")
      .eq("tenant_id", context.tenantDbId),
    supabaseAdmin
      .from(BILL_PAYMENT_TRANSACTION_TABLE)
      .select("*")
      .eq("tenant_id", context.tenantDbId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const firstError = billsError || rulesError || transactionsError;
  if (firstError) {
    return new Response(
      JSON.stringify({ success: false, error: firstError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ruleMap = new Map((rules || []).map((row) => [row.bill_id, row]));
  const serializedBills = (bills || []).map((row) =>
    serializeBill(
      { ...row, status: computeBillStatus(row) },
      ruleMap.get(row.id),
    ),
  );

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        bills: serializedBills,
        autopayRules: (rules || []).map(serializeAutopayRule),
        recentTransactions: (transactions || []).map(
          serializeBillPaymentTransaction,
        ),
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST(request) {
  const access = await requireBillPaymentsAccess(request, "write");
  if (access.response) return access.response;

  const { context } = access;
  const body = await request.json().catch(() => ({}));

  try {
    const payload = buildBillWritePayload(body);
    payload.tenant_id = context.tenantDbId;
    payload.user_id = context.userId;
    payload.status = computeBillStatus(payload);
    payload.created_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from(BILL_TABLE)
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, data: serializeBill(data) }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
}
