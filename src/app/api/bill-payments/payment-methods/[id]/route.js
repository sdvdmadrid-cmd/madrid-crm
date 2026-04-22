import {
  BILL_PAYMENT_METHOD_TABLE,
  listBillPaymentMethodsForContext,
  requireBillPaymentsAccess,
  serializeBillPaymentMethod,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUuid } from "@/lib/supabase-db";

export async function PATCH(request, { params }) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;
  const { context } = access;
  const { id } = await params;
  const methodId = normalizeUuid(id);
  if (!methodId) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid payment method id" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const body = await request.json().catch(() => ({}));
  const update = {
    allow_autopay: body.allowAutopay !== false,
    updated_at: new Date().toISOString(),
  };

  if (body.isDefault === true) {
    await supabaseAdmin
      .from(BILL_PAYMENT_METHOD_TABLE)
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", context.tenantDbId)
      .eq("user_id", context.userId);
    update.is_default = true;
  }

  const { data, error } = await supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .update(update)
    .eq("id", methodId)
    .eq("tenant_id", context.tenantDbId)
    .eq("user_id", context.userId)
    .select("*")
    .maybeSingle();

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (!data) {
    return new Response(
      JSON.stringify({ success: false, error: "Payment method not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({ success: true, data: serializeBillPaymentMethod(data) }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function DELETE(request, { params }) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;
  const { context } = access;
  const { id } = await params;
  const methodId = normalizeUuid(id);
  if (!methodId) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid payment method id" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const methods = await listBillPaymentMethodsForContext(context);
  const current = methods.find((row) => row.id === methodId);
  if (!current) {
    return new Response(
      JSON.stringify({ success: false, error: "Payment method not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { error } = await supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .delete()
    .eq("id", methodId)
    .eq("tenant_id", context.tenantDbId)
    .eq("user_id", context.userId);

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
