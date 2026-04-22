import {
  requireBillPaymentsAccess,
  savePlaidPaymentMethod,
  serializeBillPaymentMethod,
} from "@/lib/bill-payments";
import {
  exchangePlaidPublicToken,
  getPlaidAccounts,
  isPlaidConfigured,
} from "@/lib/plaid-integration";

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
  const publicToken = String(body.publicToken || "").trim();
  const requestedAccountId = String(body.accountId || "").trim();

  if (!publicToken) {
    return new Response(
      JSON.stringify({ success: false, error: "Public token is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const exchange = await exchangePlaidPublicToken(publicToken);
    const accounts = await getPlaidAccounts(exchange.access_token);
    const account = requestedAccountId
      ? accounts.find((candidate) => candidate.account_id === requestedAccountId)
      : accounts[0];

    if (!account) {
      throw new Error("No eligible Plaid account was returned");
    }

    const savedMethod = await savePlaidPaymentMethod({
      context: access.context,
      itemId: exchange.item_id,
      account,
      accessToken: exchange.access_token,
      setDefault: body.setDefault === true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          paymentMethod: serializeBillPaymentMethod(savedMethod),
          accounts: accounts.map((candidate) => ({
            id: candidate.account_id,
            name: candidate.name || candidate.official_name || "Bank account",
            mask: candidate.mask || "",
            subtype: candidate.subtype || "",
            type: candidate.type || "",
          })),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
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