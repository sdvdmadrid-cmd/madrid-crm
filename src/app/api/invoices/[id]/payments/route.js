export async function POST(request, { params }) {
  try {
    await request.text().catch(() => "");
    await params;
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Direct payment mutation is disabled. Stripe payment status is managed by backend webhooks only.",
      }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/invoices/:id/payments] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unable to process payment request",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
