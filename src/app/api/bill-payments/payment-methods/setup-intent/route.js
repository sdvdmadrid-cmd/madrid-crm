import {
  createBillPaymentSetupIntent,
  requireBillPaymentsSubscriptionForStorage,
  requireBillPaymentsAccess,
} from "@/lib/bill-payments";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  checkBillPaymentsRateLimit,
  getRequestIp,
  recordBillPaymentsRateLimit,
} from "@/lib/rate-limit";

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;
  const subscriptionResponse = requireBillPaymentsSubscriptionForStorage(
    access.context,
  );
  if (subscriptionResponse) return subscriptionResponse;

  const ip = getRequestIp(request);
  const limitState = await checkBillPaymentsRateLimit({
    tenantId: access.context.tenantDbId,
    userId: access.context.userId,
    ip,
    action: "setup",
  });
  if (!limitState.allowed) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Too many setup attempts. Please wait and try again.",
        code: "RATE_LIMITED",
        retryAfterSeconds: limitState.retryAfterSeconds,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }
  const body = await request.json().catch(() => ({}));

  try {
    const methodType = String(body.methodType || "card")
      .trim()
      .toLowerCase();
    const { setupIntent } = await createBillPaymentSetupIntent(
      access.context,
      methodType,
    );

    await recordBillPaymentsRateLimit({
      tenantId: access.context.tenantDbId,
      userId: access.context.userId,
      ip,
      action: "setup",
    });

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
