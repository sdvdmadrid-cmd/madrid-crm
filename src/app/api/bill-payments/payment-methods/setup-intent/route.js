import {
  createBillPaymentSetupIntent,
  requireBillPaymentsAccess,
} from "@/lib/bill-payments";

export async function POST(request) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;
  const body = await request.json().catch(() => ({}));

  try {
    const methodType = String(body.methodType || "card")
      .trim()
      .toLowerCase();
    const { setupIntent } = await createBillPaymentSetupIntent(
      access.context,
      methodType,
    );
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
        },
      }),
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
