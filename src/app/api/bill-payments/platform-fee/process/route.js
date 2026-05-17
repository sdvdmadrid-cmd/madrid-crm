import { processBillPaymentsMonthlyPlatformFees } from "@/lib/bill-payments";
import {
  enforceSameOriginForMutation,
  timingSafeEqualString,
} from "@/lib/request-security";

function isAuthorized(request) {
  const secret = String(
    process.env.BILL_PLATFORM_FEE_CRON_SECRET ||
      process.env.BILL_AUTOPAY_CRON_SECRET ||
      "",
  ).trim();
  const requestSecret = String(request.headers.get("x-cron-secret") || "").trim();
  if (!secret) return false;
  return timingSafeEqualString(requestSecret, secret);
}

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;
  if (!isAuthorized(request)) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const body = await request.json().catch(() => ({}));
  const chargeMonth = String(body.chargeMonth || "").trim();
  const dryRun = body.dryRun === true;

  try {
    const summary = await processBillPaymentsMonthlyPlatformFees({
      chargeMonth,
      dryRun,
    });

    return new Response(
      JSON.stringify({ success: true, data: summary }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unable to process monthly platform fee",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
