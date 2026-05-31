import { runAiCompletion } from "../ai-service.js";
import { parseAgentStructuredResponse } from "./parse-response.js";

export async function generateHeroCopyPatches({
  request,
  tenantId,
  userId,
  snapshot,
  context,
  userMessage,
  language = "en",
}) {
  const form = snapshot?.form || {};
  const company = context?.company?.name || "Our Company";
  const industry = context?.industry?.label || "home services";

  const system = `You rewrite website hero copy for a contractor using FieldBase Website Builder.
Company: ${company}
Industry: ${industry}
Current headline: ${form.headline || "(empty)"}
Current subheadline: ${form.subheadline || "(empty)"}
Current CTA: ${form.ctaText || "(empty)"}

Return JSON only:
{
  "answer": "2-3 sentences explaining what you changed",
  "summaries": ["Updated hero headline", "Updated hero subheadline"],
  "patches": {
    "headline": "max 80 chars, compelling",
    "subheadline": "max 200 chars",
    "ctaText": "short CTA e.g. Request Free Estimate"
  }
}
Do not include pricing. Match the requested tone. Language: ${language === "es" ? "Spanish" : language === "pl" ? "Polish" : "English"}.`;

  const response = await runAiCompletion({
    request,
    tenantId,
    userId,
    feature: "workspace_agent_hero",
    modelTier: "mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: String(userMessage || "Improve the hero section").slice(0, 1500) },
    ],
    maxTokens: 500,
    temperature: 0.45,
  });

  const parsed = parseAgentStructuredResponse(response.text || "");
  const patches = parsed.patches || null;
  if (!patches?.headline && !patches?.subheadline) {
    return { answer: parsed.answer || "Could not generate hero copy.", patches: null, summaries: [] };
  }

  return {
    answer: parsed.answer,
    patches: {
      headline: String(patches.headline || form.headline || "").slice(0, 120),
      subheadline: String(patches.subheadline || form.subheadline || "").slice(0, 280),
      ctaText: String(patches.ctaText || form.ctaText || "Request Free Estimate").slice(0, 60),
    },
    summaries:
      parsed.summaries?.length > 0
        ? parsed.summaries
        : ["Updated hero headline", "Updated hero subheadline"],
  };
}
