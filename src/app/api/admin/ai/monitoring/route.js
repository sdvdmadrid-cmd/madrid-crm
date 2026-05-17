import { getAuthenticatedTenantContext } from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";

let supabaseAdminClientPromise = null;

async function getSupabaseAdminClient() {
  if (!supabaseAdminClientPromise) {
    supabaseAdminClientPromise = import("@/lib/supabase-admin").then(
      (module) => module.supabaseAdmin,
    );
  }
  return supabaseAdminClientPromise;
}

const MONTHLY_SPEND_CAP_USD = Number(process.env.AI_MONTHLY_SPEND_CAP_USD || 250);

function getAlertLevel(utilizationPercent) {
  if (utilizationPercent >= 100) return "capped";
  if (utilizationPercent >= 85) return "critical";
  if (utilizationPercent >= 70) return "warning";
  return "normal";
}

function toMonthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function GET(request) {
  try {
    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated || access.role !== "super_admin") {
      return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const enabled = await isPlatformFeatureEnabled("platform_ai_monitoring", true);
    if (!enabled) {
      return Response.json(
        { success: false, error: "AI monitoring is disabled by feature flag" },
        { status: 403 },
      );
    }

    let supabaseAdmin;
    try {
      supabaseAdmin = await getSupabaseAdminClient();
    } catch (error) {
      console.error("[api/admin/ai/monitoring] Supabase admin client unavailable", error);
      return Response.json(
        { success: false, error: "AI monitoring is not configured" },
        { status: 503 },
      );
    }

    const monthStart = toMonthStartIso();
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("action,metadata,created_at")
      .gte("created_at", monthStart)
      .in("action", ["ai.request.completed", "ai.request.failed", "ai.spend.alert"])
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data || [];
    const completed = rows.filter((row) => row.action === "ai.request.completed");
    const failed = rows.filter((row) => row.action === "ai.request.failed");
    const spendAlerts = rows.filter((row) => row.action === "ai.spend.alert");

    const tokenUsage = completed.reduce(
      (acc, row) => {
        const usage = row?.metadata?.usage || {};
        acc.prompt += Number(usage.prompt_tokens || 0);
        acc.completion += Number(usage.completion_tokens || 0);
        acc.total += Number(usage.total_tokens || 0);
        return acc;
      },
      { prompt: 0, completion: 0, total: 0 },
    );

    const estimatedCostUsd = Number(
      completed
        .reduce((sum, row) => sum + Number(row?.metadata?.estimatedCostUsd || 0), 0)
        .toFixed(6),
    );
    const utilizationPercent = MONTHLY_SPEND_CAP_USD > 0
      ? Number(((estimatedCostUsd / MONTHLY_SPEND_CAP_USD) * 100).toFixed(2))
      : 0;
    const alertLevel = getAlertLevel(utilizationPercent);

    const byFeatureMap = new Map();
    for (const row of rows) {
      const feature = String(row?.metadata?.feature || "unknown");
      const current = byFeatureMap.get(feature) || { feature, total: 0, failed: 0 };
      current.total += 1;
      if (row.action === "ai.request.failed") current.failed += 1;
      byFeatureMap.set(feature, current);
    }

    const topFeatures = [...byFeatureMap.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return Response.json({
      success: true,
      data: {
        totalRequests: rows.length,
        failedRequests: failed.length,
        successfulRequests: completed.length,
        tokenUsage,
        estimatedCostUsd,
        monthlyCapUsd: MONTHLY_SPEND_CAP_USD,
        utilizationPercent,
        alertLevel,
        spendAlerts: spendAlerts
          .map((row) => ({
            thresholdPercent: Number(row?.metadata?.thresholdPercent || 0),
            utilizationPercent: Number(row?.metadata?.utilizationPercent || 0),
            spendUsd: Number(row?.metadata?.spendUsd || 0),
            createdAt: row?.created_at || null,
          }))
          .sort((a, b) => b.thresholdPercent - a.thresholdPercent),
        topFeatures,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to load AI monitoring" },
      { status: 500 },
    );
  }
}
