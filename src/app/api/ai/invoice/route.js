import { generateInvoiceAssistant } from "@/lib/document-ai";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export async function POST(request) {
  try {
    const invoiceAiEnabled = await isPlatformFeatureEnabled("feature_ai_invoice_assistant", true);
    if (!invoiceAiEnabled) {
      return new Response(
        JSON.stringify({ success: false, error: "AI invoice assistant is disabled by feature flag" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const data = generateInvoiceAssistant(body);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/ai/invoice][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
