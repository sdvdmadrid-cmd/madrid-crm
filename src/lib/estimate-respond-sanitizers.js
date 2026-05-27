/**
 * Pure sanitizers for the public estimate-respond endpoint
 *   POST /api/estimates/[id]/respond
 *
 * These helpers were originally inlined in the route file under the
 * App Router constraint that route.js modules can only export HTTP
 * handlers. Moving them into a dedicated lib module lets the unit
 * tests in tests/unit/estimate-respond-sanitizers.test.mjs import
 * the real production code — previously the test mirrored a private
 * copy of the same logic, which would silently diverge if anyone
 * tweaked the route in isolation.
 *
 * Why this guard layer matters: the respond endpoint is token-gated
 * but otherwise UNAUTHENTICATED. The caller is the customer (or
 * anyone holding the token). The two free-form fields it accepts are
 * persisted into the estimates.notes TEXT column without any further
 * DB-side enforcement of length. Without these caps a malicious
 * caller can:
 *
 *   1. Stuff hundreds of MB into requestedItems (no count cap, no
 *      per-item cap, no total cap) and push the JSON-encoded notes
 *      blob past the 1MB Supabase row-size soft limit.
 *   2. Pad noteText up to the Postgres TEXT limit via the appended
 *      `Client note: ...` chunk.
 *   3. Slow every subsequent read of the row (PDF builds, contractor
 *      view, email regeneration — all of which re-fetch the row).
 *
 * The caps are:
 *
 *   - MAX_REQUESTED_ITEMS = 50          (count cap)
 *   - MAX_REQUESTED_ITEM_BYTES = 4 KB   (per-item JSON-serialized cap)
 *   - MAX_REQUESTED_ITEMS_TOTAL_BYTES = 64 KB (cumulative cap)
 *   - MAX_CLIENT_NOTE_CHARS = 5 KB      (free-form note cap)
 *
 * A real customer submission rarely has more than ~5 requested items,
 * each well under 1KB. The caps sit roughly one order of magnitude
 * above the legitimate worst case and three orders of magnitude
 * below the abuse case.
 */

export const MAX_REQUESTED_ITEMS = 50;
export const MAX_REQUESTED_ITEM_BYTES = 4 * 1024;
export const MAX_REQUESTED_ITEMS_TOTAL_BYTES = 64 * 1024;
export const MAX_CLIENT_NOTE_CHARS = 5 * 1024;

/**
 * Sanitize a client-supplied `requestedItems` array.
 *
 * Returns:
 *   - `null` if the input is not an array (matching the legacy
 *     "no items" shape so stringifyEstimateNotes can omit the
 *     field entirely)
 *   - `null` if every entry was rejected (same reason)
 *   - otherwise a filtered, count-truncated array that respects
 *     per-item and total size caps
 *
 * Sanitization rules, applied in order:
 *   1. Truncate to MAX_REQUESTED_ITEMS entries.
 *   2. Drop entries that cannot be JSON-serialized (circular refs,
 *      symbols, etc.).
 *   3. Drop entries whose serialized length exceeds
 *      MAX_REQUESTED_ITEM_BYTES (a single huge item).
 *   4. Stop accepting further entries once the running total reaches
 *      MAX_REQUESTED_ITEMS_TOTAL_BYTES (cumulative cap).
 *
 * Order of accepted items is preserved — the contractor reads these
 * back as a list and reordering would silently change meaning.
 */
export function sanitizeRequestedItems(value) {
  if (!Array.isArray(value)) return null;
  const limitedByCount = value.slice(0, MAX_REQUESTED_ITEMS);
  const accepted = [];
  let totalBytes = 0;
  for (const item of limitedByCount) {
    let serialized;
    try {
      serialized = JSON.stringify(item);
    } catch {
      continue;
    }
    if (typeof serialized !== "string") continue;
    if (serialized.length === 0) continue;
    if (serialized.length > MAX_REQUESTED_ITEM_BYTES) continue;
    if (totalBytes + serialized.length > MAX_REQUESTED_ITEMS_TOTAL_BYTES) {
      break;
    }
    totalBytes += serialized.length;
    accepted.push(item);
  }
  return accepted.length > 0 ? accepted : null;
}

/**
 * Cap free-form client notes before they get concatenated into the
 * stored noteText field. The revision-log path already independently
 * truncates to 1000 chars for the timeline display; this guards the
 * (potentially larger) appended chunk that lives in the notes blob.
 *
 * Implementation detail: we slice BEFORE trimming so an attacker
 * can't pad with leading/trailing whitespace to push real content
 * past the cap. trim-then-slice would give every whitespace
 * character one free slot of budget; slice-then-trim caps the total
 * footprint first, then strips whitespace. The cap is on bytes
 * persisted, not on visible characters.
 */
export function sanitizeClientNote(value) {
  const raw = String(value || "");
  return raw.slice(0, MAX_CLIENT_NOTE_CHARS).trim();
}
