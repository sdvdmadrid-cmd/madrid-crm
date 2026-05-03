import {
  BILL_PAYMENT_TRANSACTION_TABLE,
  requireBillPaymentsAccess,
  serializeBillPaymentTransaction,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request) {
  const access = await requireBillPaymentsAccess(request, "read");
  if (access.response) return access.response;

  const { context } = access;
  const { searchParams } = new URL(request.url);
  const status = String(searchParams.get("status") || "")
    .trim()
    .toLowerCase();
  const source = String(searchParams.get("source") || "")
    .trim()
    .toLowerCase();
  const billId = String(searchParams.get("billId") || "").trim();

  let query = supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .select("*")
    .eq("tenant_id", context.tenantDbId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (billId) query = query.eq("bill_id", billId);

  const { data, error } = await query;
  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: (data || []).map(serializeBillPaymentTransaction),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
