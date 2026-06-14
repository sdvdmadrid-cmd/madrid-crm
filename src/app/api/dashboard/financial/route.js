import {
  getApiResponseCache,
  isApiResponseCacheEnabled,
  setApiResponseCache,
} from "@/lib/api-response-cache";
import { getExecutiveDashboardMetrics } from "@/lib/executive-dashboard.js";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

const CACHE_TTL_SECONDS = 120;

function cacheKey(tenantId) {
  return `dashboard-financial:${tenantId}`;
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const key = cacheKey(tenantDbId);
    const cached = await getApiResponseCache(key);
    if (cached) {
      return Response.json(
        { success: true, data: cached, cached: true },
        {
          headers: {
            "Cache-Control": "private, max-age=30",
            "X-Cache": isApiResponseCacheEnabled() ? "HIT-REDIS" : "HIT-MEMORY",
          },
        },
      );
    }

    const metrics = await getExecutiveDashboardMetrics(tenantDbId);
    await setApiResponseCache(key, metrics, CACHE_TTL_SECONDS);
    return Response.json(
      { success: true, data: metrics },
      { headers: { "X-Cache": "MISS" } },
    );
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
