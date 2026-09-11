import "server-only";

import {
  buildEstimateDraftFromParsed,
  buildHeuristicReference,
} from "@/lib/ai-estimate-draft-helpers";
import { runAiCompletion } from "@/lib/ai-service";

const SYSTEM_PROMPT = [
  "You are an estimate parser for a field-contractor SaaS.",
  "Convert a free-form description into a structured estimate draft.",
  "Reply ONLY with JSON, no prose, no markdown.",
  "Schema:",
  "{",
  '  "title": string,            // short job label, max 80 chars',
  '  "clientName": string,       // optional, blank if not mentioned',
  '  "address": string,          // optional, blank if not mentioned',
  '  "services": [               // 1..6 entries',
  '    { "name": string, "qty": number, "unitPrice": number, "notes": string }',
  "  ],",
  '  "scopeNotes": string,       // free-form scope summary',
  '  "assumptions": string[],    // 0..6 assumptions used in pricing',
  '  "confidence": number,       // 0..1',
  '  "missing": string[]         // names of fields you could not fill',
  "}",
  "Pricing guidelines:",
  "- Use realistic US contractor rates (labor $60–$120/hr, common materials/services).",
  "- For snow plowing, residential driveway pricing typically ranges $40–$120 per visit.",
  "- For lawn/landscaping work, hourly billing or per-sqft fees are common.",
  "- Quantity defaults to 1 if not stated. Never invent a client name.",
  "- If the description is too vague to price, return services: [] and note it in missing[].",
].join("\n");

function parseDraftJson(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }
  return parsed && typeof parsed === "object" ? parsed : null;
}

/**
 * LLM-backed estimate draft from free-form text. Does not write to DB.
 */
export async function generateEstimateDraftFromText({
  request = null,
  tenantId,
  userId = null,
  prompt,
  feature = "estimate_from_text",
} = {}) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    const err = new Error("prompt is required");
    err.status = 400;
    throw err;
  }

  const ai = await runAiCompletion({
    request,
    tenantId,
    userId,
    feature,
    modelTier: "mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: cleanPrompt },
    ],
    temperature: 0.2,
    maxTokens: 600,
  });

  const parsed = parseDraftJson(ai.text);
  if (!parsed) {
    const err = new Error("Could not parse the description — try adding more detail.");
    err.status = 502;
    throw err;
  }

  const draft = {
    ...buildEstimateDraftFromParsed(parsed),
    source: "ai",
  };

  return {
    draft,
    heuristicReference: buildHeuristicReference(draft),
    ai: {
      model: ai.model,
      usage: ai.usage,
      estimatedCostUsd: ai.estimatedCostUsd,
      responseTimeMs: ai.responseTimeMs,
    },
  };
}

export {
  buildEstimateDraftFromParsed,
  buildHeuristicEstimateDraft,
  buildHeuristicReference,
  normalizeEstimateDraftServices,
} from "@/lib/ai-estimate-draft-helpers";
