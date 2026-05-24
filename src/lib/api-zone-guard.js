import {
  PLATFORM_ZONE,
  isPrivateDashboardApiPath,
  isPublicWebsiteApiPath,
  zoneResponseHeaders,
} from "@/lib/platform-architecture";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { canWriteOperationalData } from "@/lib/access-control";

/**
 * Private dashboard API — requires authenticated tenant session.
 */
export async function requirePrivateTenantApi(request, { write = false } = {}) {
  const ctx = await getAuthenticatedTenantContext(request);
  if (!ctx.authenticated || !ctx.tenantDbId) {
    return { ok: false, response: unauthenticatedResponse() };
  }
  if (write && !canWriteOperationalData(ctx.role)) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: "Forbidden" },
        { status: 403, headers: zoneResponseHeaders(PLATFORM_ZONE.PRIVATE_DASHBOARD) },
      ),
    };
  }
  return { ok: true, ctx };
}

export function privateJson(data, init = {}) {
  const headers = {
    ...zoneResponseHeaders(PLATFORM_ZONE.PRIVATE_DASHBOARD),
    ...(init.headers || {}),
  };
  return Response.json(data, { ...init, headers });
}

export function publicWebsiteJson(data, init = {}) {
  const headers = {
    ...zoneResponseHeaders(PLATFORM_ZONE.PUBLIC_WEBSITE),
    ...(init.headers || {}),
  };
  return Response.json(data, { ...init, headers });
}

export function assertRouteZone(pathname) {
  if (isPublicWebsiteApiPath(pathname) && isPrivateDashboardApiPath(pathname)) {
    return "mixed";
  }
  if (isPublicWebsiteApiPath(pathname)) return PLATFORM_ZONE.PUBLIC_WEBSITE;
  if (isPrivateDashboardApiPath(pathname)) return PLATFORM_ZONE.PRIVATE_DASHBOARD;
  return "unknown";
}
