import { getAuthenticatedTenantContext } from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { WEBSITE_MEDIA_BUCKET } from "@/lib/website-media-storage";

export const dynamic = "force-dynamic";

/**
 * Owner-only real-time usage dashboard.
 * Aggregates the numbers that matter for capacity planning:
 *   - Tenants / contractors / websites (and how many are live).
 *   - Auth users + MAU over the last 30 days.
 *   - AI spend + request count (per-tenant cap visibility).
 *   - Business volume (leads, jobs, invoices, estimates) last 30d/7d/24h.
 *   - Storage object count for the website-media bucket.
 *   - Capacity utilization vs the documented platform ceilings so
 *     "where is the next bottleneck" is one glance.
 */
export async function GET(request) {
  const { authenticated, role } = await getAuthenticatedTenantContext(request);
  if (!authenticated || role !== "super_admin") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const oneDayAgoIso = new Date(now - 24 * 3600 * 1000).toISOString();
  const sevenDaysAgoIso = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
  const thirtyDaysAgoIso = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

  const safeCount = async (table, filters = []) => {
    try {
      let q = supabaseAdmin.from(table).select("*", { count: "exact", head: true });
      for (const f of filters) q = f(q);
      const { count, error } = await q;
      if (error) return { count: 0, missing: true };
      return { count: Number(count || 0), missing: false };
    } catch {
      return { count: 0, missing: true };
    }
  };

  // Tenants / websites
  const tenants = await safeCount("contractor_websites");
  const liveWebsites = await safeCount("contractor_websites", [
    (q) => q.eq("published", true),
  ]);
  const draftDirty = await safeCount("contractor_websites", [
    (q) => q.eq("has_unpublished_changes", true),
  ]);

  // Business volume
  const ranges = { d30: thirtyDaysAgoIso, d7: sevenDaysAgoIso, d1: oneDayAgoIso };
  const businessTables = ["website_leads", "jobs", "invoices", "estimates"];
  const business = {};
  for (const table of businessTables) {
    business[table] = {};
    for (const [key, iso] of Object.entries(ranges)) {
      const result = await safeCount(table, [(q) => q.gte("created_at", iso)]);
      business[table][key] = result.count;
    }
  }

  // Auth users + MAU
  let totalUsers = 0;
  let mau = 0;
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const users = data?.users || [];
    totalUsers = users.length;
    mau = users.filter((u) => {
      const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
      return last > 0 && now - last < 30 * 24 * 3600 * 1000;
    }).length;
  } catch {
    /* ignore */
  }

  // AI spend: single RPC aggregate instead of scanning thousands of audit rows.
  let aiSpendUsd = 0;
  let aiRequests30d = 0;
  let aiRequests24h = 0;
  let recentActionsPerMin = 0;
  try {
    const { data: aiSummary, error: aiError } = await supabaseAdmin.rpc(
      "get_owner_ai_usage_summary",
      {
        p_since: thirtyDaysAgoIso,
        p_day_since: oneDayAgoIso,
      },
    );
    if (!aiError && aiSummary) {
      aiRequests30d = Number(aiSummary.requests30d || 0);
      aiRequests24h = Number(aiSummary.requests24h || 0);
      aiSpendUsd = Number(aiSummary.spendUsd30d || 0);
    }
  } catch {
    /* ignore */
  }
  try {
    const oneMinAgo = new Date(now - 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("audit_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneMinAgo);
    recentActionsPerMin = Number(count || 0);
  } catch {
    /* ignore */
  }

  // Storage: count of root entries in the website-media bucket.
  // Listing recursively is too heavy for an owner dashboard ping, so we
  // return entry count and bucket id; the dashboard explains it's a
  // rough proxy. For accurate storage size, use the Supabase project
  // dashboard.
  let bucketEntries = null;
  try {
    const { data } = await supabaseAdmin.storage
      .from(WEBSITE_MEDIA_BUCKET)
      .list("", { limit: 1000 });
    bucketEntries = (data || []).length;
  } catch {
    /* ignore */
  }

  // Capacity model — keep in sync with docs in chat. These are the
  // documented soft ceilings for the current Vercel Pro + Supabase Pro
  // + OpenAI Tier 1-2 stack.
  const capacity = {
    activeContractors: {
      label: "Concurrent active contractors",
      current: mau,
      soft: 1000,
      hard: 20000,
      bottleneck: "Vercel Pro concurrent invocations",
    },
    storage: {
      label: "Website-media bucket entries (rough)",
      current: bucketEntries ?? 0,
      soft: 6500,
      hard: 100000,
      bottleneck: "Supabase Pro storage (100 GB)",
    },
    aiMonthly: {
      label: "Platform AI spend last 30d (USD)",
      current: Number(aiSpendUsd.toFixed(4)),
      soft: 5000,
      hard: 25000,
      bottleneck: "OpenAI Tier 2 (request Tier 3 upgrade)",
    },
    tenants: {
      label: "Tenant rows (contractor_websites)",
      current: tenants.count,
      soft: 10000,
      hard: 26000,
      bottleneck: "Supabase Pro DB size (8 GB)",
    },
  };

  return Response.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      tenants: { total: tenants.count, live: liveWebsites.count, draftDirty: draftDirty.count },
      users: { total: totalUsers, mau },
      ai: {
        spendUsd30d: Number(aiSpendUsd.toFixed(4)),
        requests30d: aiRequests30d,
        requests24h: aiRequests24h,
      },
      activity: { actionsLastMinute: recentActionsPerMin },
      business,
      storage: { bucket: WEBSITE_MEDIA_BUCKET, entries: bucketEntries },
      capacity,
    },
  });
}
