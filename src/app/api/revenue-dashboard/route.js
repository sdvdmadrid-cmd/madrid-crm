import {
  deleteApiResponseCache,
  getApiResponseCache,
  isApiResponseCacheEnabled,
  setApiResponseCache,
} from "@/lib/api-response-cache";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

const CACHE_TTL_SECONDS = 120;

function cacheKey(tenantId, role, limit) {
  return `revenue-dashboard:${tenantId || "all"}:${role || "worker"}:${limit}`;
}

function toPositiveInt(value, fallback = 14, max = 90) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

function toNullableUuid(value) {
  if (!value) {
    return null;
  }

  return String(value).trim() || null;
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
        if (!context?.authenticated) {
      return unauthenticatedResponse();
    }
    const { tenantDbId, role } = context;

    const { searchParams } = new URL(request.url);
    const limit = toPositiveInt(searchParams.get("limit"), 14, 90);
    const requestedContractorId = toNullableUuid(
      searchParams.get("contractorId"),
    );
    const contractorFilter =
      String(role || "").toLowerCase() === "super_admin"
        ? requestedContractorId
        : tenantDbId;
    const key = cacheKey(contractorFilter, role, limit);
    const cached = await getApiResponseCache(key);

    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=30",
          "X-Cache": isApiResponseCacheEnabled() ? "HIT-REDIS" : "HIT-MEMORY",
        },
      });
    }

    const { data, error } = await supabaseAdmin.rpc("get_revenue_dashboard", {
      p_contractor_id: contractorFilter,
      p_limit_count: limit,
    });

    if (error) {
      console.error("[api/revenue-dashboard][GET] Supabase RPC error", error);
      throw new Error(error.message);
    }

    const payload = {
      totalRevenue: Number(data?.totalRevenue || 0),
      totalPayments: Number(data?.totalPayments || 0),
      recentPayments: Array.isArray(data?.recentPayments)
        ? data.recentPayments.map((row) => ({
            day: row.day || null,
            contractorId: row.contractorId || null,
            totalRevenue: Number(row.totalRevenue || 0),
            totalPayments: Number(row.totalPayments || 0),
          }))
        : [],
    };

    await setApiResponseCache(key, payload, CACHE_TTL_SECONDS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=30",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("[api/revenue-dashboard][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function DELETE(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
        if (!context?.authenticated) {
      return unauthenticatedResponse();
    }
    const { tenantDbId, role } = context;

    const { searchParams } = new URL(request.url);
    const limit = toPositiveInt(searchParams.get("limit"), 14, 90);
    const requestedContractorId = toNullableUuid(
      searchParams.get("contractorId"),
    );
    const contractorFilter =
      String(role || "").toLowerCase() === "super_admin"
        ? requestedContractorId
        : tenantDbId;
    await deleteApiResponseCache(cacheKey(contractorFilter, role, limit));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/revenue-dashboard][DELETE] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
