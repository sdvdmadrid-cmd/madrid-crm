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
import { generateEstimateSuggestion } from "@/lib/estimate-ai";

/**
 * AI Estimate from free-form text
 * --------------------------------
 * The classic /api/ai/estimate endpoint is a deterministic pricing
 * heuristic (labor rate × hours × complexity multipliers). This new
 * endpoint adds a real LLM-backed path: it parses a free-form prompt
 * like "snow plowing for 3 driveways on Maple St, two of them are large
 * and one has a slope" into a structured estimate draft (title, services,
 * notes), then cross-checks the suggested total against the heuristic so
 * the contractor sees both numbers.
 *
 * Returns the draft ONLY — never writes to the estimates table. The
 * bubble passes the result through to the editor at /estimates/new so
 * the contractor can review and tweak before saving.
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

    const ai = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "estimate_from_text",
      modelTier: "mini",
      messages: [
        {
          role: "system",
          content: [
            "You are an estimate parser for a field-contractor SaaS.",
            "Convert a free-form description into a structured estimate draft.",
            "Reply ONLY with JSON, no prose, no markdown.",
            "Schema:",
            '{',
            '  "title": string,            // short job label, max 80 chars',
            '  "clientName": string,       // optional, blank if not mentioned',
            '  "address": string,          // optional, blank if not mentioned',
            '  "services": [               // 1..6 entries',
            '    { "name": string, "qty": number, "unitPrice": number, "notes": string }',
            '  ],',
            '  "scopeNotes": string,       // free-form scope summary',
            '  "assumptions": string[],    // 0..6 assumptions used in pricing',
            '  "confidence": number,       // 0..1',
            '  "missing": string[]         // names of fields you could not fill',
            '}',
            "Pricing guidelines:",
            "- Use realistic US contractor rates (labor $60–$120/hr, common materials/services).",
            "- For snow plowing, residential driveway pricing typically ranges $40–$120 per visit.",
            "- For lawn/landscaping work, hourly billing or per-sqft fees are common.",
            "- Quantity defaults to 1 if not stated. Never invent a client name.",
            "- If the description is too vague to price, return services: [] and note it in missing[].",
          ].join("\n"),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      maxTokens: 600,
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
        { success: false, error: "Could not parse the description — try adding more detail." },
        { status: 502 },
      );
    }

    const services = Array.isArray(parsed.services)
      ? parsed.services
          .slice(0, 6)
          .map((s, idx) => {
            const name = String(s?.name || "").slice(0, 200).trim();
            const qty = Math.max(1, Math.min(999, Number(s?.qty) || 1));
            const unitPrice = Math.max(0, Math.min(1_000_000, Number(s?.unitPrice) || 0));
            const notes = String(s?.notes || "").slice(0, 300).trim();
            return {
              id: `ai_${idx + 1}`,
              name: name || `Service ${idx + 1}`,
              qty,
              unitPrice,
              price: Math.round(qty * unitPrice * 100) / 100,
              notes,
            };
          })
          .filter((s) => s.name)
      : [];

    const draft = {
      title: String(parsed.title || "").slice(0, 200).trim(),
      clientName: String(parsed.clientName || "").slice(0, 200).trim(),
      address: String(parsed.address || "").slice(0, 300).trim(),
      services,
      scopeNotes: String(parsed.scopeNotes || "").slice(0, 2000).trim(),
      assumptions: Array.isArray(parsed.assumptions)
        ? parsed.assumptions.slice(0, 6).map((v) => String(v).slice(0, 200))
        : [],
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      missing: Array.isArray(parsed.missing)
        ? parsed.missing.slice(0, 6).map((v) => String(v).slice(0, 40))
        : [],
      subtotal: services.reduce((sum, s) => sum + (s.price || 0), 0),
    };

    // Sanity check the AI's pricing against the deterministic heuristic
    // (existing /api/ai/estimate logic). Surfaces a "heuristic suggests"
    // number so the contractor sees both sources and isn't blindly trusting
    // the LLM's math.
    let heuristicReference = null;
    try {
      const heuristic = generateEstimateSuggestion({
        title: draft.title,
        service: draft.title,
        details: draft.scopeNotes,
        complexity: "medium",
        urgency: "normal",
      });
      heuristicReference = {
        recommendedPrice: heuristic?.recommendedPrice ?? null,
        lowPrice: heuristic?.lowPrice ?? null,
        highPrice: heuristic?.highPrice ?? null,
      };
    } catch {
      heuristicReference = null;
    }

    return Response.json({
      success: true,
      data: {
        draft,
        heuristicReference,
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
        technicalMessage: error?.message || "AI estimate parsing failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
