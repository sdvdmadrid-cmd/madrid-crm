/**
 * Pure helpers shared across the estimate → quote → invoice
 * promotion / share-link / checkout / invoices routes for:
 *
 *   - turning a dollar amount into integer cents safely
 *     (no NaN, no floating-point edge cases)
 *   - stripping a base-number prefix ("EST-", "QT-", "INV-") so a
 *     downstream allocator can reuse the numeric suffix when, e.g.,
 *     promoting EST-0042 into QT-0042 + INV-0042.
 *
 * Both functions were previously inlined byte-for-byte in five
 * routes:
 *   src/app/api/invoices/route.js
 *   src/app/api/invoices/[id]/route.js
 *   src/app/api/estimate-builder/[id]/promote/route.js
 *   src/app/api/estimate-builder/[id]/share-link/route.js
 * plus a near-clone inside src/app/api/estimates/[id]/respond/
 *   route.js's toCents.
 *
 * Drift was inevitable. This module is pure (no server-only, no
 * supabase, no I/O) so unit tests import the real helpers directly.
 */

/**
 * Convert a money amount in dollars to integer cents, safely.
 *
 *   toCents(1.99)       -> 199
 *   toCents("1.99")     -> 199
 *   toCents(null)       -> 0
 *   toCents("abc")      -> 0    (NaN-guarded)
 *   toCents(Infinity)   -> 0    (Number.isFinite-guarded)
 *
 * Math.round handles floating-point rounding for two-decimal money.
 */
export function toCents(amount) {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Number of recent quote rows to scan for max(numeric suffix).
 *
 * Mirrors INVOICE_LOOKUP_LIMIT / ESTIMATE_LOOKUP_LIMIT. Picked at 200
 * because that matches the existing in-route lookup limits in
 * /api/estimate-builder/[id]/promote and /share-link before the
 * refactor; raising it would scan more rows for no real benefit
 * (tenants with >200 quotes since their last gap still allocate
 * monotonically because the max is taken from the most-recent
 * batch).
 */
export const QUOTE_LOOKUP_LIMIT = 200;

/**
 * Given a batch of rows that each carry a `quote_number` string,
 * return the highest numeric suffix found (or 0 if none parsed).
 *
 * Unlike pickMaxInvoiceSequence (which requires "INV-####"), this
 * helper is permissive: it scans for any embedded digits via
 * /(\d+)/ — matching what /api/estimate-builder/[id]/promote and
 * /share-link already do. Tenants may have legacy quote numbers
 * like "2024-001" or hand-typed numbers ("Q4-RUSH-12"); the digit
 * sequence still contributes to the max so allocation stays
 * monotonic.
 *
 * Pure — no DB, no state.
 */
export function pickMaxQuoteSequence(rows) {
  let max = 0;
  for (const row of rows || []) {
    const match = String(row?.quote_number || "").match(/(\d+)/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Strip a leading "EST-" / "QT-" / "INV-" prefix and trim whitespace
 * so the remaining suffix can be reused by another allocator.
 *
 *   normalizeBaseNumber("EST-0042")        -> "0042"
 *   normalizeBaseNumber("qt 17")           -> "17"
 *   normalizeBaseNumber("inv_0099")        -> "0099"
 *   normalizeBaseNumber("Q3-Custom")       -> "Q3-Custom"  (no known prefix)
 *   normalizeBaseNumber("")                -> ""
 *   normalizeBaseNumber("   ")             -> ""
 *
 * Falls back to the original (trimmed) raw value when the strip
 * would produce an empty string, so weird hand-edited inputs are
 * not silently lost.
 */
export function normalizeBaseNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const stripped = raw.replace(/^(EST|QT|INV)[-_\s]*/i, "").trim();
  const compact = stripped.replace(/\s+/g, "");
  return compact || raw;
}
