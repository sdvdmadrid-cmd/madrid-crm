import {
  createStripeCheckoutSessionForAccess,
  requireInvoicePaymentAccess,
} from "@/lib/stripe-payments";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid invoice id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const access = await requireInvoicePaymentAccess(request, id);
    if (access.response) {
      return access.response;
    }

    const checkout = await createStripeCheckoutSessionForAccess({
      request,
      access,
      amount: body.amount,
      source: "invoice_checkout",
    });
    if (checkout.response) {
      return checkout.response;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          invoiceId: access.invoice.id,
          paymentId: checkout.paymentId,
          sessionId: checkout.sessionId,
          checkoutUrl: checkout.checkoutUrl,
          amount: checkout.payableAmount,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/invoices/:id/checkout] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
