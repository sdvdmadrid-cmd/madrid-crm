/**
 * Parse structured JSON from workspace agent AI responses.
 */

export function parseAgentStructuredResponse(rawText) {
  const text = String(rawText || "").trim();
  const match = text.match(/\{[\s\S]*"answer"[\s\S]*\}\s*$/);
  if (!match) {
    return {
      answer: text,
      plan: null,
      actions: [],
      summaries: [],
      requiresConfirmation: false,
      patches: null,
    };
  }

  try {
    const parsed = JSON.parse(match[0]);
    const answer = String(parsed.answer || text.slice(0, match.index).trim()).trim();
    const plan =
      parsed.plan && typeof parsed.plan === "object"
        ? {
            title: String(parsed.plan.title || "Proposed changes").slice(0, 120),
            steps: Array.isArray(parsed.plan.steps)
              ? parsed.plan.steps.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 12)
              : [],
          }
        : null;

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions
          .filter((a) => a && typeof a === "object" && a.type)
          .map((a) => ({
            type: String(a.type).slice(0, 80),
            payload: a.payload && typeof a.payload === "object" ? a.payload : {},
            summary: String(a.summary || "").slice(0, 200),
          }))
          .slice(0, 8)
      : [];

    const summaries = Array.isArray(parsed.summaries)
      ? parsed.summaries.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 12)
      : actions.map((a) => a.summary).filter(Boolean);

    const patches =
      parsed.patches && typeof parsed.patches === "object" ? parsed.patches : null;

    return {
      answer,
      plan,
      actions,
      summaries,
      requiresConfirmation: parsed.requiresConfirmation === true,
      patches,
    };
  } catch {
    return {
      answer: text.trim(),
      plan: null,
      actions: [],
      summaries: [],
      requiresConfirmation: false,
      patches: null,
    };
  }
}
