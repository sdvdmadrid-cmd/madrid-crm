import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  recordManualInvoicePayment,
  requireInvoicePaymentAccess,
} from "@/lib/stripe-payments";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

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

    const result = await recordManualInvoicePayment({ access, body });
    if (result.response) {
      return result.response;
    }

    return new Response(
      JSON.stringify({ success: true, data: result.invoice }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/invoices/:id/payments] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unable to register payment",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
