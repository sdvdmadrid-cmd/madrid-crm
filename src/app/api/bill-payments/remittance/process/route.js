import { processBillPaymentRemittanceQueue } from "@/lib/bill-payments";
import {
  isCronAuthorized,
  unauthorizedCronResponse,
} from "@/lib/cron-auth";
import { enforceSameOriginForMutation } from "@/lib/request-security";

const CRON_ENV_KEYS = [
  "BILL_REMITTANCE_CRON_SECRET",
  "BILL_AUTOPAY_CRON_SECRET",
];

export async function GET(request) {
  return POST(request);
}

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;
  if (!isCronAuthorized(request, CRON_ENV_KEYS)) {
    return unauthorizedCronResponse();
  }

  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun === true;
  const limit = Number(body.limit || 25);
  const providerName = String(body.providerName || "").trim();

  try {
    const summary = await processBillPaymentRemittanceQueue({
      limit,
      dryRun,
      providerName,
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
        error: error?.message || "Unable to process remittance queue",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
