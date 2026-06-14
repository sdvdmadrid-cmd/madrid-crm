import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage, runAiCompletion } from "@/lib/ai-service";

async function getTenantCrmSnapshot(tenantId) {
  const [
    { data: clients = [], error: clientsError },
    { data: jobs = [], error: jobsError },
    { data: invoices = [], error: invoicesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("clients")
      .select("id,name,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabaseAdmin
      .from("jobs")
      .select("id,status,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(120),
    supabaseAdmin
      .from("invoices")
      .select("id,status,total_cents,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  if (clientsError) throw new Error(clientsError.message);
  if (jobsError) throw new Error(jobsError.message);
  if (invoicesError) throw new Error(invoicesError.message);

  const paidRevenue = invoices.reduce((sum, row) => {
    const status = String(row.status || "").toLowerCase();
    if (status !== "paid") return sum;
    return sum + Number(row.total_cents || 0);
  }, 0);

  const openInvoices = invoices.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return status !== "paid";
  }).length;

  return {
    clientsTotal: clients.length,
    jobsTotal: jobs.length,
    jobsOpen: jobs.filter((row) => String(row.status || "").toLowerCase() !== "completed").length,
    invoicesTotal: invoices.length,
    invoicesOpen: openInvoices,
    paidRevenueUsd: Number((paidRevenue / 100).toFixed(2)),
    latestClients: clients.slice(0, 10).map((row) => row.name).filter(Boolean),
  };
}

export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const enabled = await isPlatformFeatureEnabled("feature_ai_crm_summary", true);
    if (!enabled) {
      return Response.json(
        { success: false, error: "AI CRM summary is disabled by feature flag" },
        { status: 403 },
      );
    }

    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated) return unauthenticatedResponse();
    if (!canWrite(access.role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const question = String(body.question || "Summarize CRM health and priorities for this week.").trim();

    const snapshot = await getTenantCrmSnapshot(access.tenantDbId);
    const ai = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "crm_summary",
      modelTier: "strong",
      messages: [
        {
          role: "system",
          content:
            "You are a CRM strategist for contractor businesses. Keep output concise and practical.",
        },
        {
          role: "user",
          content: [
            `Question: ${question}`,
            `CRM snapshot JSON: ${JSON.stringify(snapshot)}`,
            "Return: executive summary, risks, and top 3 actions.",
          ].join("\n"),
        },
      ],
      temperature: 0.2,
      maxTokens: 700,
    });

    return Response.json({
      success: true,
      data: {
        summary: ai.text,
        snapshot,
        ai: {
          model: ai.model,
          usage: ai.usage,
          estimatedCostUsd: ai.estimatedCostUsd,
          responseTimeMs: ai.responseTimeMs,
        },
      },
    });
  } catch (error) {
    const code = normalizeAiErrorCode(error?.aiCode || error?.code, error?.status, error?.message);
    return Response.json(
      buildAiErrorPayload({
        code,
        language: getRequestLanguage(request, "en"),
        status: Number(error?.status || 502),
        technicalMessage: error?.message || "AI CRM summary failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
