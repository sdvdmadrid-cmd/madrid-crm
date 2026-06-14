import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import {
  getCompanyProfileByTenant,
  withDefaultCompanyProfile,
} from "@/lib/company-profile-store";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage } from "@/lib/ai-service";
import { buildWorkspaceContext } from "@/lib/workspace-agent/context.js";
import { fetchCrmLeadSnapshot } from "@/lib/workspace-agent/crm-context.js";
import { normalizeAgentSummaries } from "@/lib/workspace-agent/client-executor.js";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/orchestrator.js";

export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const message = String(body.message || body.question || "").trim().slice(0, 4000);
  const pathname = String(body.pathname || "").trim().slice(0, 300);
  const agentMode = body.agentMode !== false;
  const history = Array.isArray(body.history) ? body.history : [];
  const snapshot =
    body.snapshot && typeof body.snapshot === "object" ? body.snapshot : null;
  const confirmPlan =
    body.confirmPlan && typeof body.confirmPlan === "object" ? body.confirmPlan : null;

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({ tenantId: access.tenantDbId }),
    access.tenantDbId,
  );

  const crm = await fetchCrmLeadSnapshot(access.tenantDbId, access.role);

  const context = buildWorkspaceContext({
    pathname,
    snapshot,
    companyProfile: profile,
    authUser: { role: access.role, tenantId: access.tenantDbId },
    crmSnapshot: crm,
  });

  const language = getRequestLanguage(request, "en");

  const result = await runWorkspaceAgentTurn({
    request,
    tenantId: access.tenantDbId,
    userId: access.userId,
    message,
    history,
    context,
    snapshot,
    agentMode,
    confirmPlan,
    language,
  });

  if (result.error) {
    const code = normalizeAiErrorCode(result.aiCode, result.status, result.error);
    return Response.json(
      buildAiErrorPayload({
        code,
        language,
        status: result.status || 400,
        technicalMessage: result.error,
      }),
      { status: result.status || 400 },
    );
  }

  return Response.json({
    success: true,
    data: {
      answer: result.answer,
      actions: Array.isArray(result.actions) ? result.actions : [],
      summaries: normalizeAgentSummaries(result.summaries, "apiSummaries"),
      plan: result.plan,
      requiresConfirmation: result.requiresConfirmation === true,
      patches: result.patches,
      source: result.source,
      context: {
        page: context.page.id,
        pageLabel: context.page.label,
      },
    },
  });
}
