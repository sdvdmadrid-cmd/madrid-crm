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

    const enabled = await isPlatformFeatureEnabled("feature_ai_scheduling", true);
    if (!enabled) {
      return Response.json(
        { success: false, error: "Scheduling assistant is disabled by feature flag" },
        { status: 403 },
      );
    }

    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated) return unauthenticatedResponse();
    if (!canWrite(access.role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const jobSummary = String(body.jobSummary || "").trim();
    const availability = Array.isArray(body.availability) ? body.availability.slice(0, 20) : [];
    const constraints = String(body.constraints || "").trim();
    const weatherSummary = String(body.weatherSummary || "").trim();

    if (!jobSummary) {
      return Response.json(
        { success: false, error: "jobSummary is required" },
        { status: 400 },
      );
    }

    const ai = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "scheduling_assistant",
      modelTier: "mini",
      messages: [
        {
          role: "system",
          content:
            "You are a scheduling assistant for field contractors. Output concise JSON with schedulePlan, riskNotes, and backupSlots.",
        },
        {
          role: "user",
          content: [
            `Job: ${jobSummary}`,
            `Availability: ${JSON.stringify(availability)}`,
            `Constraints: ${constraints || "N/A"}`,
            `Weather: ${weatherSummary || "N/A"}`,
            'Return only JSON: {"schedulePlan": string, "riskNotes": string[], "backupSlots": string[] }',
          ].join("\n"),
        },
      ],
      temperature: 0.2,
      maxTokens: 360,
    });

    let parsed = null;
    try {
      parsed = JSON.parse(ai.text);
    } catch {
      const match = ai.text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed) {
      return Response.json({ success: false, error: "Scheduling response format was invalid" }, { status: 502 });
    }

    return Response.json({
      success: true,
      data: {
        schedulePlan: String(parsed.schedulePlan || "").slice(0, 1000),
        riskNotes: Array.isArray(parsed.riskNotes) ? parsed.riskNotes.slice(0, 8).map((v) => String(v).slice(0, 180)) : [],
        backupSlots: Array.isArray(parsed.backupSlots) ? parsed.backupSlots.slice(0, 8).map((v) => String(v).slice(0, 120)) : [],
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
        technicalMessage: error?.message || "AI scheduling failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
