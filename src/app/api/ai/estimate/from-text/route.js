import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage } from "@/lib/ai-service";
import { generateEstimateDraftFromText } from "@/lib/ai-estimate-draft";

/**
 * AI Estimate from free-form text
 * --------------------------------
 * Parses a free-form prompt into a structured estimate draft.
 * Returns the draft ONLY — never writes to the estimates table.
 */
export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const enabled = await isPlatformFeatureEnabled("feature_ai_estimate", true);
    if (!enabled) {
      return Response.json(
        { success: false, error: "Estimate assistant is disabled by feature flag" },
        { status: 403 },
      );
    }

    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated) return unauthenticatedResponse();
    if (!canWrite(access.role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
      return Response.json(
        { success: false, error: "prompt is required" },
        { status: 400 },
      );
    }

    const result = await generateEstimateDraftFromText({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      prompt,
      feature: "estimate_from_text",
    });

    return Response.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (Number(error?.status) === 400) {
      return Response.json(
        { success: false, error: error.message || "prompt is required" },
        { status: 400 },
      );
    }
    if (Number(error?.status) === 502 && /parse/i.test(String(error?.message || ""))) {
      return Response.json(
        { success: false, error: error.message },
        { status: 502 },
      );
    }
    const code = normalizeAiErrorCode(error?.aiCode || error?.code, error?.status, error?.message);
    return Response.json(
      buildAiErrorPayload({
        code,
        language: getRequestLanguage(request, "en"),
        status: Number(error?.status || 502),
        technicalMessage: error?.message || "AI estimate parsing failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
