import { getExecutiveDashboardMetrics } from "@/lib/executive-dashboard.js";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

const cache = new Map();
const CACHE_TTL_MS = 120_000;

function getCached(tenantId) {
  const entry = cache.get(tenantId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

function setCached(tenantId, data) {
  if (cache.size > 500) cache.clear();
  cache.set(tenantId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(request) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const cached = getCached(tenantDbId);
    if (cached) {
      return Response.json(
        { success: true, data: cached, cached: true },
        { headers: { "Cache-Control": "private, max-age=30" } },
      );
    }

    const metrics = await getExecutiveDashboardMetrics(tenantDbId);
    setCached(tenantDbId, metrics);
    return Response.json({ success: true, data: metrics });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}