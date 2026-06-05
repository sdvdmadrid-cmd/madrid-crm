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
  unauthenticatedResponse,
} from "@/lib/tenant";

const CACHE_TTL_SECONDS = 120;

function cacheKey(tenantId) {
  return `dashboard-metrics:${tenantId}`;
}

function buildMetricsFromRpc(row) {
  const clientsTotal = Number(row?.clientsTotal || 0);
  const clientsWon = Number(row?.clientsWon || 0);
  const clientsEstimateSent = Number(row?.clientsEstimateSent || 0);

  const conversionRate =
    clientsTotal > 0
      ? Number(((clientsWon / clientsTotal) * 100).toFixed(1))
      : 0;

  const winRateFromEstimates =
    clientsEstimateSent > 0
      ? Number(((clientsWon / clientsEstimateSent) * 100).toFixed(1))
      : 0;

  return {
    clients: { total: clientsTotal },
    jobs: {
      total: Number(row?.jobsTotal || 0),
      active: Number(row?.jobsActive || 0),
      pendingDraft: Number(row?.jobsPendingDraft || 0),
      pendingInvoice: Number(row?.jobsPendingInvoice || 0),
      totalRevenue: Number(row?.totalRevenue || 0),
    },
    invoices: {
      total: Number(row?.invoicesTotal || 0),
      unpaidCount: Number(row?.invoicesUnpaid || 0),
      draftCount: Number(row?.invoicesDraft || 0),
      overdueCount: Number(row?.invoicesOverdue || 0),
      outstanding: Number(row?.outstanding || 0),
    },
    contracts: {
      total: Number(row?.contractsTotal || 0),
      active: Number(row?.contractsActive || 0),
    },
    estimateRequests: {
      total: Number(row?.estimateRequestsTotal || 0),
      newCount: Number(row?.estimateRequestsNew || 0),
    },
    leadInbox: {
      newCount: Number(row?.websiteLeadsNew || 0),
    },
    conversion: {
      totalLeads: clientsTotal,
      wonLeads: clientsWon,
      estimatesSent: clientsEstimateSent,
      conversionRate,
      winRateFromEstimates,
    },
  };
}

async function fetchDashboardMetrics(tenantId) {
  const { data, error } = await supabaseAdmin.rpc("get_dashboard_metrics", {
    p_tenant_id: tenantId,
  });

  if (error) {
    console.error("[api/dashboard-metrics] Supabase RPC error", {
      tenantId,
      error,
    });
    throw new Error(error.message);
  }

  return buildMetricsFromRpc(data || {});
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    if (!context?.authenticated) {
      return unauthenticatedResponse();
    }
    const { tenantDbId } = context;

    const key = cacheKey(tenantDbId);
    const cached = await getApiResponseCache(key);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": isApiResponseCacheEnabled() ? "HIT-REDIS" : "HIT-MEMORY",
          "Cache-Control": "private, max-age=45",
        },
      });
    }

    const metrics = await fetchDashboardMetrics(tenantDbId);
    await setApiResponseCache(key, metrics, CACHE_TTL_SECONDS);

    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
        "Cache-Control": "private, max-age=45",
      },
    });
  } catch (error) {
    console.error("[api/dashboard-metrics][GET] error", error);
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
    if (!context?.authenticated) {
      return unauthenticatedResponse();
    }

    await deleteApiResponseCache(cacheKey(context.tenantDbId));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/dashboard-metrics][DELETE] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
