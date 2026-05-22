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

    const enabled = await isPlatformFeatureEnabled("feature_ai_client_reply", true);
    if (!enabled) {
      return Response.json(
        { success: false, error: "Client reply assistant is disabled by feature flag" },
        { status: 403 },
      );
    }

    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated) return unauthenticatedResponse();
    if (!canWrite(access.role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const clientMessage = String(body.clientMessage || "").trim();
    const context = String(body.context || "").trim();
    const tone = String(body.tone || "professional").trim();

    if (!clientMessage) {
      return Response.json(
        { success: false, error: "clientMessage is required" },
        { status: 400 },
      );
    }

    const ai = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "client_reply_assistant",
      modelTier: "mini",
      messages: [
        {
          role: "system",
          content:
            "You write concise contractor client replies. Keep it courteous, clear, and action-oriented. No markdown.",
        },
        {
          role: "user",
          content: [
            `Client message: ${clientMessage}`,
            `Context: ${context || "N/A"}`,
            `Tone: ${tone}`,
            "Draft one reply under 140 words.",
          ].join("\n"),
        },
      ],
      temperature: 0.4,
      maxTokens: 260,
    });

    return Response.json({
      success: true,
      data: {
        reply: ai.text,
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
        technicalMessage: error?.message || "AI client reply failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
