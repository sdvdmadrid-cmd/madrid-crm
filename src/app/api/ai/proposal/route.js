import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage, runAiCompletion } from "@/lib/ai-service";

export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const enabled = await isPlatformFeatureEnabled("feature_ai_proposal", true);
    if (!enabled) {
      return Response.json(
        { success: false, error: "AI proposal generation is disabled by feature flag" },
        { status: 403 },
      );
    }

    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated) return unauthenticatedResponse();
    if (!canWrite(access.role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const projectType = String(body.projectType || body.service || "").trim();
    const scope = String(body.scope || body.description || "").trim();
    const budget = String(body.budget || "").trim();
    const timeline = String(body.timeline || "").trim();

    if (!projectType && !scope) {
      return Response.json(
        { success: false, error: "projectType or scope is required" },
        { status: 400 },
      );
    }

    const prompt = [
      `Project type: ${projectType || "Not specified"}`,
      `Scope: ${scope || "Not specified"}`,
      `Budget: ${budget || "Not specified"}`,
      `Timeline: ${timeline || "Not specified"}`,
      "Write a professional contractor proposal with these sections: overview, scope, deliverables, timeline, pricing assumptions, exclusions, and next steps.",
      "Keep it concise and practical.",
    ].join("\n");

    const ai = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "proposal_generator",
      modelTier: "strong",
      messages: [
        {
          role: "system",
          content:
            "You are a senior proposal writer for contractor businesses. Return clean plain text with clear sections.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    });

    return Response.json({
      success: true,
      data: {
        proposal: ai.text,
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
        technicalMessage: error?.message || "AI proposal failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
