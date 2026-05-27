/**
 * Pure tier / cap configuration for the public-quote rate-limit scheme.
 *
 * The actual rate-limit logic (DB reads, memory store, retry-after
 * math) lives in @/lib/rate-limit and depends on supabase + the
 * `server-only` boundary. This module is the pure subset of that
 * configuration so the unit tests at
 * tests/unit/public-quote-rate-limit-buckets.test.mjs can import the
 * real production caps and the real production cap-resolver, rather
 * than mirror them locally and silently drift.
 *
 * Bucketing strategy:
 *   - Every check / record call carries an `action` string (e.g.
 *     "view", "pdf", "approval", "requests").
 *   - The rate-limit keys are namespaced by action:
 *       public-quote:${action}:ip:<ip>
 *       public-quote:${action}:token:<token>
 *     so a flood against one action cannot drain the budget of
 *     another.
 *   - Caps are tiered: "read-like" actions get the more generous
 *     view-tier caps; everything else (writes, signature submissions,
 *     change requests) gets the stricter mutation-tier caps.
 *   - "pdf" gets its own cap constants that happen to equal the view
 *     constants today (read-only parity), but live as their own
 *     numbers so we can dial them independently later if needed
 *     without touching the JSON-view caps.
 */

export const PUBLIC_QUOTE_VIEW_IP_MAX_ATTEMPTS = 40;
export const PUBLIC_QUOTE_VIEW_TOKEN_MAX_ATTEMPTS = 25;

// PDF downloads are read-only like `view` but live in a separate bucket
// so a customer hammering the PDF endpoint cannot exhaust the JSON-view
// budget (or vice versa). Caps mirror `view` since both are non-mutating.
export const PUBLIC_QUOTE_PDF_IP_MAX_ATTEMPTS = 40;
export const PUBLIC_QUOTE_PDF_TOKEN_MAX_ATTEMPTS = 25;

export const PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS = 15;
export const PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS = 10;

/**
 * Read-only actions get the more generous "view-like" caps; everything
 * else falls into the stricter mutation bucket. Adding a new read-like
 * action is a one-line change: add it to this set.
 *
 * Critical invariant: write-flavored actions (approval, requests,
 * sign, etc.) MUST NOT be added here. The mutation-tier caps exist
 * specifically to slow down abuse of the state-changing endpoints.
 */
export const PUBLIC_QUOTE_READ_ACTIONS = new Set(["view", "pdf"]);

/**
 * Resolve the (ip, token) cap pair for a given action.
 *
 * Pure function — no I/O. The cap RESOLUTION is here; the actual
 * record/check (which talks to supabase + the in-memory cache) lives
 * in @/lib/rate-limit and calls back into this helper.
 *
 * Contract pinned by
 * tests/unit/public-quote-rate-limit-buckets.test.mjs.
 */
export function publicQuoteCapsForAction(action) {
  if (action === "pdf") {
    return {
      ip: PUBLIC_QUOTE_PDF_IP_MAX_ATTEMPTS,
      token: PUBLIC_QUOTE_PDF_TOKEN_MAX_ATTEMPTS,
    };
  }
  if (PUBLIC_QUOTE_READ_ACTIONS.has(action)) {
    return {
      ip: PUBLIC_QUOTE_VIEW_IP_MAX_ATTEMPTS,
      token: PUBLIC_QUOTE_VIEW_TOKEN_MAX_ATTEMPTS,
    };
  }
  return {
    ip: PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS,
    token: PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS,
  };
}

/**
 * Build the canonical key prefix for a (action, kind) pair. Used by
 * rate-limit.js to construct the per-request lookup keys. Pure so
 * tests can pin the format here.
 *
 *   keyPrefix("pdf", "ip")    -> "public-quote:pdf:ip"
 *   keyPrefix("view", "token") -> "public-quote:view:token"
 *
 * The downstream caller appends the actual value (`ip` or `token`)
 * after a final ":" and lowercases the full string. The "kind" must
 * be either "ip" or "token" — anything else is a bug at the call
 * site, not in this module.
 */
export function publicQuoteRateLimitKeyPrefix(action, kind) {
  return `public-quote:${action}:${kind}`;
}
