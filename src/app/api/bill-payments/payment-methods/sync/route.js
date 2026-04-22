import {
  requireBillPaymentsAccess,
  serializeBillPaymentMethod,
  syncBillPaymentMethod,
} from "@/lib/bill-payments";

export async function POST(request) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;

  const body = await request.json().catch(() => ({}));
  try {
    const row = await syncBillPaymentMethod({
      context: access.context,
      paymentMethodId: String(body.paymentMethodId || "").trim(),
      setDefault: body.setDefault === true,
    });

    return new Response(
      JSON.stringify({ success: true, data: serializeBillPaymentMethod(row) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
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
