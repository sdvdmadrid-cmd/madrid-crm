import {
  summarizeInvoiceRevenue,
  summarizeInvoiceRevenueByTenant,
} from "@/lib/invoice-revenue-summary";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

const INVOICE_SUMMARY_COLUMNS =
  "id, tenant_id, amount, paid_amount, balance_due, status";

const summaryCache = new Map();
const SUMMARY_CACHE_TTL_MS = 90_000;

function summaryCacheKey(tenantDbId, role, scope) {
  return `${tenantDbId}:${role}:${scope}`;
}

async function loadInvoiceSummaryRows(tenantDbId, role, scope) {
  let query = supabaseAdmin
    .from("invoices")
    .select(INVOICE_SUMMARY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);

  const isPlatformScope =
    scope === "platform" && (role || "").toLowerCase() === "super_admin";

  if (!isPlatformScope) {
    query = query.eq("tenant_id", tenantDbId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: data || [], isPlatformScope };
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const scope = new URL(request.url).searchParams.get("scope") || "tenant";
    const cacheKey = summaryCacheKey(tenantDbId, role, scope);
    const cached = summaryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json({ success: true, data: cached.data, cached: true });
    }

    const { rows, isPlatformScope } = await loadInvoiceSummaryRows(
      tenantDbId,
      role,
      scope,
    );

    const summary = summarizeInvoiceRevenue(rows);
    const payload = {
      scope: isPlatformScope ? "platform" : "tenant",
      summary,
      generatedAt: new Date().toISOString(),
    };

    if (isPlatformScope) {
      payload.byTenant = summarizeInvoiceRevenueByTenant(rows);
    }

    summaryCache.set(cacheKey, {
      data: payload,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    });

    return Response.json({ success: true, data: payload });
  } catch (error) {
    console.error("[api/invoices/summary] error", error);
    return Response.json(
      { success: false, error: error?.message || "Unable to load invoice summary" },
      { status: 500 },
    );
  }
}
