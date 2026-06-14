import {
  getApiResponseCache,
  isApiResponseCacheEnabled,
  setApiResponseCache,
} from "@/lib/api-response-cache";
import { getPlatformFeatureFlagMap } from "@/lib/platform-feature-flags";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

const CACHE_TTL_SECONDS = 300;
const CACHE_KEY = "feature-flags:platform";

function buildFeatureFlagsPayload(map) {
  return {
    success: true,
    data: {
      featureWebsiteBuilder: map.feature_website_builder !== false,
      featureEstimateBuilder: map.feature_estimate_builder !== false,
      featureAiDescription: map.feature_ai_description !== false,
      featureAiInvoiceAssistant: map.feature_ai_invoice_assistant !== false,
      featureAdminAiAssistant: map.feature_admin_ai_assistant !== false,
    },
  };
}

export async function GET(request) {
  try {
    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated) {
      return unauthenticatedResponse();
    }

    const cached = await getApiResponseCache(CACHE_KEY);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": isApiResponseCacheEnabled() ? "HIT-REDIS" : "HIT-MEMORY",
          "Cache-Control": "private, max-age=120",
        },
      });
    }

    const map = await getPlatformFeatureFlagMap();
    const payload = buildFeatureFlagsPayload(map);
    await setApiResponseCache(CACHE_KEY, payload, CACHE_TTL_SECONDS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
        "Cache-Control": "private, max-age=120",
      },
    });
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
