import { createPlaidLinkToken, isPlaidConfigured } from "@/lib/plaid-integration";
import { requireBillPaymentsAccess } from "@/lib/bill-payments";

export async function POST(request) {
  const access = await requireBillPaymentsAccess(request, "sensitive");
  if (access.response) return access.response;

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