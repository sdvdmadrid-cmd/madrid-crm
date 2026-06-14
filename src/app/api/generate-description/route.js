import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage, runAiCompletion } from "@/lib/ai-service";

export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const descriptionEnabled = await isPlatformFeatureEnabled("feature_ai_description", true);
    if (!descriptionEnabled) {
      return new Response(
        JSON.stringify({ success: false, error: "AI description generation is disabled by feature flag" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { role, authenticated, tenantDbId, userId  } = context;
        if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const input = String(body.input || "").trim();

    if (!input) {
      return new Response(
        JSON.stringify({ success: false, error: "Input is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const response = await runAiCompletion({
      request,
      tenantId: tenantDbId,
      userId,
      feature: "estimate_description",
      modelTier: "mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional contractor assistant. Output only concise plain text (2-4 sentences).",
        },
        {
          role: "user",
          content: `Rewrite this contractor estimate description clearly and professionally: ${input}`,
        },
      ],
      maxTokens: 180,
      temperature: 0.4,
    });

    const description = response.text;

    if (!description) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No description returned from AI",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          description,
          ai: {
            model: response.model,
            usage: response.usage,
            estimatedCostUsd: response.estimatedCostUsd,
            responseTimeMs: response.responseTimeMs,
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/generate-description][POST] error", error);
    const code = normalizeAiErrorCode(error?.aiCode || error?.code, error?.status, error?.message);
    const payload = buildAiErrorPayload({
      code,
      language: getRequestLanguage(request, "en"),
      status: Number(error?.status || 502),
      technicalMessage: error?.message || "AI request failed",
    });
    return new Response(
      JSON.stringify(payload),
      { status: Number(error?.status || 502), headers: { "Content-Type": "application/json" } },
    );
  }
}
