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

async function countRows(table, tenantId, { filter } = {}) {
  let query = supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return Number(count || 0);
}

async function fetchDashboardMetricsFallback(tenantId) {
  const [
    clientsTotal,
    clientsWon,
    clientsEstimateSent,
    jobsTotal,
    jobsActive,
    jobsPendingDraft,
    jobsPendingInvoice,
    invoicesTotal,
    invoicesUnpaid,
    invoicesDraft,
    invoicesOverdue,
    contractsTotal,
    contractsActive,
    estimateRequestsTotal,
    estimateRequestsNew,
    websiteLeadsNew,
  ] = await Promise.all([
    countRows("clients", tenantId),
    countRows("clients", tenantId, {
      filter: (q) => q.eq("lead_status", "won"),
    }),
    countRows("clients", tenantId, {
      filter: (q) => q.eq("estimate_sent", true),
    }),
    countRows("jobs", tenantId),
    countRows("jobs", tenantId, {
      filter: (q) => q.in("status", ["Active", "In Progress"]),
    }),
    countRows("jobs", tenantId, {
      filter: (q) => q.in("status", ["Pending", "Draft"]),
    }),
    countRows("jobs", tenantId, {
      filter: (q) => q.eq("status", "Completed").eq("invoiced", false),
    }),
    countRows("invoices", tenantId),
    countRows("invoices", tenantId, {
      filter: (q) => q.in("status", ["Unpaid", "Sent"]),
    }),
    countRows("invoices", tenantId, {
      filter: (q) => q.eq("status", "Draft"),
    }),
    countRows("invoices", tenantId, {
      filter: (q) => q.in("status", ["Overdue", "Past Due"]),
    }),
    countRows("contracts", tenantId),
    countRows("contracts", tenantId, {
      filter: (q) => q.neq("status", "Cancelled"),
    }),
    countRows("estimate_requests", tenantId),
    countRows("estimate_requests", tenantId, {
      filter: (q) => q.eq("status", "new"),
    }),
    countRows("contractor_website_leads", tenantId, {
      filter: (q) => q.eq("status", "new"),
    }),
  ]);

  const { data: revenueRows, error: revenueError } = await supabaseAdmin
    .from("jobs")
    .select("price")
    .eq("tenant_id", tenantId);
  if (revenueError) throw new Error(revenueError.message);
  const totalRevenue = (revenueRows || []).reduce(
    (sum, row) => sum + Number(row.price || 0),
    0,
  );

  const { data: invoiceRows, error: invoiceError } = await supabaseAdmin
    .from("invoices")
    .select("balance_due, amount")
    .eq("tenant_id", tenantId)
    .gt("balance_due", 0);
  if (invoiceError) throw new Error(invoiceError.message);
  const outstanding = (invoiceRows || []).reduce(
    (sum, row) => sum + Number(row.balance_due ?? row.amount ?? 0),
    0,
  );

  return buildMetricsFromRpc({
    clientsTotal,
    clientsWon,
    clientsEstimateSent,
    jobsTotal,
    jobsActive,
    jobsPendingDraft,
    jobsPendingInvoice,
    invoicesTotal,
    invoicesUnpaid,
    invoicesDraft,
    invoicesOverdue,
    contractsTotal,
    contractsActive,
    estimateRequestsTotal,
    estimateRequestsNew,
    websiteLeadsNew,
    totalRevenue,
    outstanding,
  });
}

async function fetchDashboardMetrics(tenantId) {
  const { data, error } = await supabaseAdmin.rpc("get_dashboard_metrics", {
    p_tenant_id: tenantId,
  });

  if (!error) {
    return buildMetricsFromRpc(data || {});
  }

  console.warn("[api/dashboard-metrics] RPC failed, using fallback counts", {
    tenantId,
    code: error.code,
    message: error.message,
  });

  return fetchDashboardMetricsFallback(tenantId);
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
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
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
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
