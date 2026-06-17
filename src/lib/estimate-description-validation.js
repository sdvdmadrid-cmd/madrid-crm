const DANGLING_END_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "could",
  "for",
  "from",
  "in",
  "including",
  "is",
  "of",
  "on",
  "or",
  "shall",
  "should",
  "such",
  "that",
  "the",
  "these",
  "this",
  "those",
  "to",
  "was",
  "were",
  "which",
  "will",
  "with",
  "would",
]);

export const ESTIMATE_DESCRIPTION_CONTINUE_PROMPT =
  "Continue the scope description exactly where you stopped. " +
  "Do not repeat any text already written. " +
  "Finish all remaining scope details and end with a complete final sentence.";

/**
 * Detect AI scope text that was cut off before finishing (token limit or mid-sentence).
 */
export function isEstimateDescriptionIncomplete(text, finishReason) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return true;
  if (String(finishReason || "").trim().toLowerCase() === "length") return true;

  if (/[.!?][)"'»]*\s*$/.test(trimmed)) return false;

  if (/[,;:]\s*$/.test(trimmed)) return true;
  if (/[-–—]\s*$/.test(trimmed)) return true;

  const lastToken = trimmed.split(/\s+/).pop() || "";
  const lastWord = lastToken.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
  if (lastWord && DANGLING_END_WORDS.has(lastWord)) return true;

  return false;
}
