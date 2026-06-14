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
import { getRequestLanguage, runAiCompletion } from "@/lib/ai-service";

/**
 * AI Scheduling Parser
 * ---------------------
 * Given a free-form prompt like "agendame con Maria el martes 9am en
 * 123 Main para snowplowing", returns a structured appointment draft
 * that the bubble can show as a confirmation card and then POST to
 * /api/appointments (which itself syncs to Google Calendar).
 *
 * The endpoint deliberately does NOT create the appointment — it only
 * proposes. This keeps the contractor in control of the final write,
 * matching the rest of the platform's "review before commit" pattern.
 */
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
    const prompt = String(body.prompt || body.jobSummary || "").trim();
    if (!prompt) {
      return Response.json(
        { success: false, error: "prompt is required" },
        { status: 400 },
      );
    }

    // Anchor the model with today's date so "el martes" resolves to a real
    // future YYYY-MM-DD. Without this anchor the model commonly drifts by
    // several days.
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayDow = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const ai = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "scheduling_parser",
      modelTier: "mini",
      messages: [
        {
          role: "system",
          content: [
            "You are a contractor scheduling parser. Convert a short user message",
            "into a structured appointment draft. Reply ONLY with JSON, no prose.",
            "Schema:",
            '{',
            '  "title": string,        // short label, max 80 chars',
            '  "clientName": string,   // person or company',
            '  "date": "YYYY-MM-DD",   // future date only',
            '  "time": "HH:MM",        // 24h format',
            '  "endTime": "HH:MM",     // optional, 24h format',
            '  "location": string,     // address or place',
            '  "notes": string,        // scope/details',
            '  "confidence": number,   // 0..1 — drop fields you are unsure of',
            '  "missing": string[]     // names of fields you could not fill',
            '}',
            "When the user gives a relative day ('mañana', 'tomorrow', 'el martes'),",
            "resolve it against the anchor date provided. Always pick the next",
            "future occurrence. Default time to 09:00 only if the user gives no",
            "hint. If something is missing, leave the field empty and add it",
            "to the missing array — never invent client names or addresses.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Today: ${todayIso} (${todayDow})`,
            `Message: ${prompt}`,
          ].join("\n"),
        },
      ],
      temperature: 0.1,
      maxTokens: 320,
    });

    let parsed = null;
    try {
      parsed = JSON.parse(ai.text);
    } catch {
      const match = ai.text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = null;
        }
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return Response.json(
        { success: false, error: "Could not parse the request — try rephrasing it." },
        { status: 502 },
      );
    }

    const draft = {
      title: String(parsed.title || "").slice(0, 200).trim(),
      clientName: String(parsed.clientName || "").slice(0, 200).trim(),
      date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : "",
      time: typeof parsed.time === "string" && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : "",
      endTime: typeof parsed.endTime === "string" && /^\d{2}:\d{2}$/.test(parsed.endTime) ? parsed.endTime : "",
      location: String(parsed.location || "").slice(0, 300).trim(),
      notes: String(parsed.notes || "").slice(0, 2000).trim(),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      missing: Array.isArray(parsed.missing) ? parsed.missing.slice(0, 6).map((v) => String(v).slice(0, 40)) : [],
    };

    // Guard against past dates — the appointments POST will reject them anyway,
    // but surfacing it here lets the UI prompt the user instead of failing later.
    if (draft.date && draft.date < todayIso) {
      draft.missing = Array.from(new Set([...(draft.missing || []), "date"]));
      draft.date = "";
    }

    return Response.json({
      success: true,
      data: {
        draft,
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
        technicalMessage: error?.message || "AI scheduling parse failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
