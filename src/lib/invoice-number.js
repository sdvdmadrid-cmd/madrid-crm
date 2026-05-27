/**
 * Pure helpers for the INV-#### invoice number scheme.
 *
 * Mirrors src/lib/estimate-number.js. Two production routes need to
 * allocate the next invoice number for a tenant:
 *
 *   - POST /api/invoices                              (invoices table)
 *   - POST /api/estimate-builder/[id]/checkout         (invoices table)
 *
 * Both previously used `COUNT(*) + 1`, which has three failure modes:
 *
 *   1. Concurrency: two simultaneous calls compute the same number
 *      and produce duplicate inserts.
 *   2. Deletions: any deleted invoice causes the next number to
 *      collide with an existing row. (COUNT shrinks; MAX does not.)
 *   3. No retry path: a single collision aborts the whole flow with
 *      an opaque error.
 *
 * The fix is the same shape the estimate-number routes already use:
 *
 *   - Read recent rows ordered by created_at desc.
 *   - Scan for the max numeric suffix.
 *   - Format as `INV-####` (4-digit floor; widens past 9999).
 *   - Caller wraps the insert in a retry-on-23505 loop, backed by
 *     the partial unique index on (tenant_id, invoice_number) from
 *     20260606100000_quote_invoice_number_uniqueness.sql.
 *
 * This module is pure (no `server-only`, no supabase import, no
 * I/O) so the unit tests can import the real helpers directly. The
 * DB read stays at each call site — it's a single supabase call that
 * is hard to share without dragging server-only into this module.
 */

export const INVOICE_NUMBER_PREFIX = "INV-";
export const INVOICE_NUMBER_MIN_PAD = 4;
export const INVOICE_LOOKUP_LIMIT = 500;

/**
 * Format a numeric sequence into the canonical "INV-####" string.
 * Pure — no DB / network / state.
 *
 * Contract:
 *   - Prefix is always uppercase "INV-".
 *   - 4-digit zero pad is a FLOOR, not a width cap:
 *       seq 1..9999   -> "INV-0001" .. "INV-9999"
 *       seq 10000+    -> "INV-10000", "INV-100000", etc.
 *   - Numbers past 9999 grow naturally without truncation.
 *
 * Pinned by tests/unit/invoice-number-format.test.mjs.
 */
export function formatInvoiceNumber(sequence) {
  return `${INVOICE_NUMBER_PREFIX}${String(sequence).padStart(
    INVOICE_NUMBER_MIN_PAD,
    "0",
  )}`;
}

/**
 * Given a batch of rows that each carry an `invoice_number` string,
 * return the highest numeric suffix found (or 0 if none parsed).
 *
 * Match is anchored on uppercase "INV-" but is case-insensitive so
 * legacy / hand-edited rows like "inv-0007" are still counted. Rows
 * whose number doesn't match the canonical shape (e.g. "INV-Q3-2024"
 * or custom strings) are skipped — they coexist with sequential
 * numbers without disrupting allocation.
 *
 * Pure — same guarantees as formatInvoiceNumber.
 */
export function pickMaxInvoiceSequence(rows) {
  let max = 0;
  for (const row of rows || []) {
    const match = String(row?.invoice_number || "").match(/^INV-(\d+)$/i);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
