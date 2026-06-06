import {
  getApiResponseCache,
  isApiResponseCacheEnabled,
  setApiResponseCache,
} from "@/lib/api-response-cache";
import { getConnectStatusForTenant } from "@/lib/stripe-connect";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

const CACHE_TTL_SECONDS = 90;

function cacheKey(tenantId) {
  return `connect-status:${tenantId}`;
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    if (!context.authenticated) {
      return unauthenticatedResponse();
    }
    if (!canManageSensitive(context.role)) {
      return forbiddenResponse();
    }

    const key = cacheKey(context.tenantDbId);
    const cached = await getApiResponseCache(key);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": isApiResponseCacheEnabled() ? "HIT-REDIS" : "HIT-MEMORY",
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const status = await getConnectStatusForTenant(context.tenantDbId);
    const payload = {
      success: true,
      data: status,
    };
    await setApiResponseCache(key, payload, CACHE_TTL_SECONDS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[api/payments/connect/status] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
