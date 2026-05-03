import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const cache = new Map();
const CACHE_TTL_MS = 45_000;

function cacheKey(tenantId) {
  return `dashboard:${tenantId}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

const MAX_CACHE_SIZE = 2000;

function setCached(key, data) {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict the oldest entry
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function safeCount(table, tenantId, role, extraFilters = []) {
  let query = supabaseAdmin
    .from(table)
    .select("id", { head: true, count: "exact" });

  if ((role || "").toLowerCase() !== "super_admin") {
    query = query.eq("tenant_id", tenantId);
  }

  for (const filter of extraFilters) {
    if (filter?.type === "eq") query = query.eq(filter.column, filter.value);
    if (filter?.type === "in") query = query.in(filter.column, filter.value);
    if (filter?.type === "neq") query = query.neq(filter.column, filter.value);
  }

  const { count, error } = await query;
  if (error) {
    console.error("[api/dashboard-metrics] Supabase count error", {
      table,
      tenantId,
      error,
    });
    return 0;
  }
  return Number(count || 0);
}

async function safeRows(table, columns, tenantId, role, limit = 500) {
  let query = supabaseAdmin.from(table).select(columns).limit(limit);
  if ((role || "").toLowerCase() !== "super_admin") {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[api/dashboard-metrics] Supabase rows error", {
      table,
      tenantId,
      error,
    });
    return [];
  }
  return data || [];
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } = getTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const key = cacheKey(tenantDbId);

    const cached = getCached(key);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
          "Cache-Control": "private, max-age=45",
        },
      });
    }

    const [
      clientsTotal,
      clientsWon,
      clientsEstimateSent,
      jobsTotal,
      jobsActive,
      jobsPendingDraft,
      invoicesTotal,
      invoicesUnpaid,
      invoicesDraft,
      contractsTotal,
      contractsActive,
      estimateRequestsTotal,
      estimateRequestsNew,
      invoicesOverdue,
      jobRows,
      invoiceRows,
    ] = await Promise.all([
      safeCount("clients", tenantDbId, role),
      safeCount("clients", tenantDbId, role, [
        { type: "eq", column: "lead_status", value: "won" },
      ]),
      safeCount("clients", tenantDbId, role, [
        { type: "eq", column: "estimate_sent", value: true },
      ]),
      safeCount("jobs", tenantDbId, role),
      safeCount("jobs", tenantDbId, role, [
        { type: "in", column: "status", value: ["Active", "In Progress"] },
      ]),
      safeCount("jobs", tenantDbId, role, [
        { type: "in", column: "status", value: ["Pending", "Draft"] },
      ]),
      safeCount("invoices", tenantDbId, role),
      safeCount("invoices", tenantDbId, role, [
        { type: "in", column: "status", value: ["Unpaid", "Sent"] },
      ]),
      safeCount("invoices", tenantDbId, role, [
        { type: "eq", column: "status", value: "Draft" },
      ]),
      safeCount("contracts", tenantDbId, role),
      safeCount("contracts", tenantDbId, role, [
        { type: "neq", column: "status", value: "Cancelled" },
      ]),
      safeCount("estimate_requests", tenantDbId, role),
      safeCount("estimate_requests", tenantDbId, role, [
        { type: "eq", column: "status", value: "new" },
      ]),
      safeCount("invoices", tenantDbId, role, [
        { type: "in", column: "status", value: ["Overdue", "Past Due"] },
      ]),
      safeRows("jobs", "price,status,invoiced", tenantDbId, role),
      safeRows("invoices", "amount,balance_due,status", tenantDbId, role),
    ]);

    const pendingInvoice = jobRows.filter(
      (row) => String(row.status || "") === "Completed" && !row.invoiced,
    ).length;

    const totalRevenue = Number(
      jobRows.reduce((sum, row) => sum + Number(row.price || 0), 0).toFixed(2),
    );

    const outstanding = Number(
      invoiceRows
        .reduce((sum, row) => {
          if (String(row.status || "") === "Paid") return sum;
          return sum + Number(row.balance_due || row.amount || 0);
        }, 0)
        .toFixed(2),
    );

    const conversionRate =
      clientsTotal > 0
        ? Number(((clientsWon / clientsTotal) * 100).toFixed(1))
        : 0;

    const winRateFromEstimates =
      clientsEstimateSent > 0
        ? Number(((clientsWon / clientsEstimateSent) * 100).toFixed(1))
        : 0;

    const metrics = {
      clients: { total: clientsTotal },
      jobs: {
        total: jobsTotal,
        active: jobsActive,
        pendingDraft: jobsPendingDraft,
        pendingInvoice,
        totalRevenue,
      },
      invoices: {
        total: invoicesTotal,
        unpaidCount: invoicesUnpaid,
        draftCount: invoicesDraft,
        overdueCount: invoicesOverdue,
        outstanding,
      },
      contracts: { total: contractsTotal, active: contractsActive },
      estimateRequests: {
        total: estimateRequestsTotal,
        newCount: estimateRequestsNew,
      },
      conversion: {
        totalLeads: clientsTotal,
        wonLeads: clientsWon,
        estimatesSent: clientsEstimateSent,
        conversionRate,
        winRateFromEstimates,
      },
    };

    setCached(key, metrics);

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
    const { tenantDbId, authenticated } = getTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    cache.delete(cacheKey(tenantDbId));
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
