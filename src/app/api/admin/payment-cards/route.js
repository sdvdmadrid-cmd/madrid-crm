import { getPlatformPaymentCardsOverview } from "@/lib/platform-payment-cards";
import { getSuperAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await getSuperAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const params = new URL(request.url).searchParams;
    const data = await getPlatformPaymentCardsOverview({
      from: params.get("from") || "",
      to: params.get("to") || "",
      methodType: params.get("methodType") || "all",
      tenantId: params.get("tenantId") || "",
      search: params.get("search") || "",
    });

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unable to load payment cards",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
