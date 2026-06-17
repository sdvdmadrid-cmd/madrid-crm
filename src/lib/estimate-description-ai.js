import { runAiCompletion } from "@/lib/ai-service";
import {
  ESTIMATE_DESCRIPTION_CONTINUE_PROMPT,
  isEstimateDescriptionIncomplete,
} from "@/lib/estimate-description-validation";

export {
  ESTIMATE_DESCRIPTION_CONTINUE_PROMPT,
  isEstimateDescriptionIncomplete,
} from "@/lib/estimate-description-validation";

export const ESTIMATE_DESCRIPTION_SYSTEM_PROMPT =
  "You are a professional contractor assistant writing customer-facing estimate scope-of-work descriptions. " +
  "Output only plain text paragraphs — no markdown, no labels, no bullet syntax. " +
  "Cover the full scope in complete sentences. Include materials, methods, and key steps when relevant. " +
  "Never stop mid-sentence. Always finish with proper ending punctuation.";

const INITIAL_MAX_TOKENS = 1200;
const CONTINUATION_MAX_TOKENS = 800;
const MAX_CONTINUATION_ROUNDS = 3;

function buildUserPrompt(input) {
  return (
    "Rewrite this contractor estimate scope of work clearly and professionally. " +
    "Preserve every task and detail from the input and expand where helpful:\n\n" +
    String(input || "").trim()
  );
}

function appendContinuation(previous, nextChunk) {
  const head = String(previous || "").trimEnd();
  const tail = String(nextChunk || "").trim();
  if (!tail) return head;
  if (!head) return tail;
  return `${head}\n\n${tail}`;
}

/**
 * Generate a complete estimate scope description, continuing automatically when truncated.
 */
export async function generateCompleteEstimateDescription({
  request,
  tenantId,
  userId,
  input,
}) {
  const userPrompt = buildUserPrompt(input);
  let messages = [
    { role: "system", content: ESTIMATE_DESCRIPTION_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  let description = "";
  let lastResponse = null;
  let continuationRounds = 0;

  while (continuationRounds <= MAX_CONTINUATION_ROUNDS) {
    const maxTokens =
      continuationRounds === 0 ? INITIAL_MAX_TOKENS : CONTINUATION_MAX_TOKENS;

    lastResponse = await runAiCompletion({
      request,
      tenantId,
      userId,
      feature: "estimate_description",
      modelTier: "mini",
      messages,
      maxTokens,
      temperature: 0.4,
    });

    const chunk = String(lastResponse?.text || "").trim();
    description =
      continuationRounds === 0 ? chunk : appendContinuation(description, chunk);

    if (!isEstimateDescriptionIncomplete(description, lastResponse?.finishReason)) {
      break;
    }

    if (continuationRounds >= MAX_CONTINUATION_ROUNDS) {
      break;
    }

    messages = [
      { role: "system", content: ESTIMATE_DESCRIPTION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
      { role: "assistant", content: description },
      { role: "user", content: ESTIMATE_DESCRIPTION_CONTINUE_PROMPT },
    ];
    continuationRounds += 1;
  }

  return {
    description: String(description || "").trim(),
    ai: lastResponse,
    continuationRounds,
    completed: !isEstimateDescriptionIncomplete(
      description,
      lastResponse?.finishReason,
    ),
  };
}
