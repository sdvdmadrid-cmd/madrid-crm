import {
  requireBillPaymentsAccess,
} from "@/lib/bill-payments";
import { getTenantPaymentMethodUsage } from "@/lib/platform-payment-cards";

export async function GET(request) {
  const access = await requireBillPaymentsAccess(request, "read");
  if (access.response) return access.response;

  try {
    const data = await getTenantPaymentMethodUsage(access.context);
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load payment method usage",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
