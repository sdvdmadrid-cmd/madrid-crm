import {
  createClientErrorResponse,
  getClientSchemaMismatchColumn,
} from "@/lib/client-records";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

function hasAuthCredentials(request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return true;
  }

  const cookieHeader = String(request.headers.get("cookie") || "");
  return (
    cookieHeader.includes("__Host-madrid_session=") ||
    cookieHeader.includes("madrid_session=")
  );
}

function getDateRange(period, from, to) {
  const now = new Date();
  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: now };
  }
  if (period === "custom" && from && to) {
    return { start: new Date(from), end: new Date(`${to}T23:59:59.999Z`) };
  }
  return { start: null, end: null };
}

function applyTenant(query, role, tenantId) {
  if ((role || "").toLowerCase() === "super_admin") return query;
  return query.eq("tenant_id", tenantId);
}

function applyDateRange(query, range) {
  if (!range.start || !range.end) return query;
  return query
    .gte("created_at", range.start.toISOString())
    .lte("created_at", range.end.toISOString());
}

async function getCount(query, column) {
  const { count, error } = await query;
  if (!error) return { count: Number(count || 0), supported: true };

  const missingColumn = getClientSchemaMismatchColumn(error);
  if (missingColumn && missingColumn === column) {
    return { count: 0, supported: false };
  }

  throw error;
}

export async function GET(request) {
  try {
    if (!hasAuthCredentials(request)) {
      return unauthenticatedResponse();
    }

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const range = getDateRange(period, from, to);

    let base = supabaseAdmin
      .from("clients")
      .select("id", { head: true, count: "exact" });
    let won = supabaseAdmin
      .from("clients")
      .select("id", { head: true, count: "exact" })
      .eq("lead_status", "won");
    let estimates = supabaseAdmin
      .from("clients")
      .select("id", { head: true, count: "exact" })
      .eq("estimate_sent", true);

    base = applyDateRange(applyTenant(base, role, tenantDbId), range);
    won = applyDateRange(applyTenant(won, role, tenantDbId), range);
    estimates = applyDateRange(applyTenant(estimates, role, tenantDbId), range);

    const [totalResult, wonResult, estimatesResult] = await Promise.all([
      getCount(base, ""),
      getCount(won, "lead_status"),
      getCount(estimates, "estimate_sent"),
    ]);

    const t = totalResult.count;
    const w = wonResult.count;
    const e = estimatesResult.count;

    const conversionRate = t > 0 ? Number(((w / t) * 100).toFixed(1)) : 0;
    const winRateFromEstimates = e > 0 ? Number(((w / e) * 100).toFixed(1)) : 0;

    return new Response(
      JSON.stringify({
        totalLeads: t,
        wonLeads: w,
        conversionRate,
        estimatesSent: e,
        winRateFromEstimates,
        supportsLeadStatus: wonResult.supported && estimatesResult.supported,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/clients/conversion] error", error);
    return createClientErrorResponse(
      error,
      "Unable to load client conversion metrics",
    );
  }
}
