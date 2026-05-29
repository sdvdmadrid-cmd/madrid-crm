/**
 * Normalize Jobber note body across API versions / union types.
 */
export function jobberNoteText(note = {}) {
  return String(
    note?.message || note?.body || note?.content || note?.text || "",
  ).trim();
}
