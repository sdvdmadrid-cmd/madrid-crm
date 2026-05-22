import { createPlaidLinkToken, isPlaidConfigured } from "@/lib/plaid-integration";
import {
  requireBillPaymentsAccess,
  requireBillPaymentsSubscriptionForStorage,
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
    action: "plaid",
  });
  if (!limitState.allowed) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Too many bank link attempts. Please try again shortly.",
        code: "RATE_LIMITED",
        retryAfterSeconds: limitState.retryAfterSeconds,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(limitState.retryAfterSeconds),
        },
      },
    );
  }

  if (!isPlaidConfigured()) {
    return new Response(
      JSON.stringify({ success: false, error: "Plaid is not configured" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const body = await request.json().catch(() => ({}));

  try {
    const data = await createPlaidLinkToken({
      userId: access.context.userId,
      redirectUri: String(body.redirectUri || "").trim(),
      language: String(body.language || "en").trim().toLowerCase() || "en",
    });

    await recordBillPaymentsRateLimit({
      tenantId: access.context.tenantDbId,
      userId: access.context.userId,
      ip,
      action: "plaid",
    });

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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