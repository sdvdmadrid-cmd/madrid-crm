import {
  listBillPaymentMethodsForContext,
  requireBillPaymentsAccess,
  serializeBillPaymentMethod,
} from "@/lib/bill-payments";

export async function GET(request) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;

  const rows = await listBillPaymentMethodsForContext(access.context);
  return new Response(
    JSON.stringify({
      success: true,
      data: rows.map(serializeBillPaymentMethod),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
