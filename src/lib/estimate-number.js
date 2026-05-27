/**
 * Pure helpers for the EST-#### estimate number scheme.
 *
 * Three production routes need to allocate the next number in a
 * tenant's sequence:
 *   - POST /api/estimates                  (estimates table)
 *   - POST /api/estimates/[id]/duplicate   (estimates table)
 *   - POST /api/estimate-builder           (estimate_builder table)
 *
 * Each one previously had its own copy of the format + max-picker
 * logic. Consolidating both pure helpers here:
 *   - removes the drift risk between the three routes,
 *   - lets the unit tests in
 *     tests/unit/estimate-number-format.test.mjs import and exercise
 *     the REAL production helpers (rather than mirror them locally),
 *     so any future change in production breaks the tests, and
 *   - keeps the tight contract in one place.
 *
 * This module is deliberately pure (no I/O, no DB import, no
 * `server-only`) so it is safe to import from tests and from any
 * client-side bundle that needs to render an estimate number. The
 * DB read still lives at each call site — it's a single supabase
 * call that is hard to share without dragging server-only down into
 * this module.
 *
 * The format is a FLOOR, not a width cap:
 *   - seq 1..9999  -> "EST-0001" .. "EST-9999"
 *   - seq 10000+   -> "EST-10000", "EST-100000", ... (natural width)
 *
 * Widening the floor (e.g. padStart(5)) would mid-stream change the
 * rendered width for existing tenants whose latest number is below
 * 10000 — a visible regression. The natural width-growth at the
 * 9999 -> 10000 boundary is the intended behavior.
 *
 * Ordering callers must use `created_at desc` (NOT estimate_number
 * desc) because lex order breaks at the 4 -> 5 digit transition:
 * "EST-10000" sorts BELOW "EST-9999" lexicographically. The
 * `pickMaxEstimateSequence` helper handles this correctly by parsing
 * the numeric suffix from each row.
 */

/**
 * The default prefix and pad width. Exported so tests and callers
 * can reference the canonical values without re-declaring them.
 */
export const ESTIMATE_NUMBER_PREFIX = "EST-";
export const ESTIMATE_NUMBER_MIN_PAD = 4;

/**
 * Default lookup batch size for callers that scan recent rows to
 * pick the next sequence. A tenant burning through 500 numbers
 * between two concurrent creates is implausible; we keep this here
 * so the three call sites can reference the same constant instead
 * of literal "500" sprinkled around.
 */
export const ESTIMATE_LOOKUP_LIMIT = 500;

/**
 * Format a numeric sequence into the canonical "EST-####" string.
 *
 * Pure — no DB / network / process state. Safe to call from anywhere.
 *
 * Contract pinned by tests/unit/estimate-number-format.test.mjs:
 *   - prefix is always uppercase "EST-"
 *   - 4-digit zero pad is a FLOOR, not a width cap (no truncation
 *     past 9999)
 */
export function formatEstimateNumber(sequence) {
  return `${ESTIMATE_NUMBER_PREFIX}${String(sequence).padStart(
    ESTIMATE_NUMBER_MIN_PAD,
    "0",
  )}`;
}

/**
 * Given a batch of rows that each carry an `estimate_number` string,
 * return the highest numeric suffix found (or 0 if none parsed).
 * Rows with a non-numeric or non-matching value are skipped.
 *
 * The match anchors on uppercase "EST-" but is case-insensitive so
 * legacy / hand-edited rows like "est-0007" are still counted.
 *
 * Pure — same guarantees as formatEstimateNumber.
 */
export function pickMaxEstimateSequence(rows) {
  let max = 0;
  for (const row of rows || []) {
    const match = String(row?.estimate_number || "").match(/^EST-(\d+)$/i);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
