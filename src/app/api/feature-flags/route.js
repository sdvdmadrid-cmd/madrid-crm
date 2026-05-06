import { getPlatformFeatureFlagMap } from "@/lib/platform-feature-flags";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export async function GET(request) {
  try {
    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated) {
      return unauthenticatedResponse();
    }

    const map = await getPlatformFeatureFlagMap();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          featureWebsiteBuilder: map.feature_website_builder !== false,
          featureEstimateBuilder: map.feature_estimate_builder !== false,
          featureAiDescription: map.feature_ai_description !== false,
          featureAiInvoiceAssistant: map.feature_ai_invoice_assistant !== false,
          featureAdminAiAssistant: map.feature_admin_ai_assistant !== false,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed to read flags" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
