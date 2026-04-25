import {
  BILL_AUTOPAY_RULE_TABLE,
  BILL_TABLE,
  buildBillWritePayload,
  computeBillStatus,
  maybeCreateNextRecurringBill,
  requireBillPaymentsAccess,
  serializeBill,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUuid } from "@/lib/supabase-db";

async function loadBill(id, tenantDbId) {
  return supabaseAdmin
    .from(BILL_TABLE)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantDbId)
    .maybeSingle();
}

export async function GET(request, { params }) {
  const access = await requireBillPaymentsAccess(request, "read");
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

  const [{ data: bill, error }, { data: rule }] = await Promise.all([
    loadBill(billId, context.tenantDbId),
    supabaseAdmin
      .from(BILL_AUTOPAY_RULE_TABLE)
      .select("*")
      .eq("bill_id", billId)
      .eq("tenant_id", context.tenantDbId)
      .maybeSingle(),
  ]);

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
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

  return new Response(
    JSON.stringify({
      success: true,
      data: serializeBill({ ...bill, status: computeBillStatus(bill) }, rule),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function PATCH(request, { params }) {
  const access = await requireBillPaymentsAccess(request, "write");
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

  const { data: currentBill, error: loadError } = await loadBill(
    billId,
    context.tenantDbId,
  );
  if (loadError) {
    return new Response(
      JSON.stringify({ success: false, error: loadError.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (!currentBill) {
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
    const payload = buildBillWritePayload(body, currentBill);
    payload.status = computeBillStatus({ ...currentBill, ...payload });
    if (payload.status === "paid") {
      payload.last_paid_at = new Date().toISOString();
    }
    const { data, error } = await supabaseAdmin
      .from(BILL_TABLE)
      .update(payload)
      .eq("id", billId)
      .eq("tenant_id", context.tenantDbId)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    if (data?.status === "paid") {
      await maybeCreateNextRecurringBill({
        context,
        bill: data,
      });
    }

    return new Response(
      JSON.stringify({ success: true, data: serializeBill(data) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function DELETE(request, { params }) {
  const access = await requireBillPaymentsAccess(request, "write");
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

  const { error } = await supabaseAdmin
    .from(BILL_TABLE)
    .delete()
    .eq("id", billId)
    .eq("tenant_id", context.tenantDbId);

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
