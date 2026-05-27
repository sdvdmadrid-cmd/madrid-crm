import test from "node:test";
import assert from "node:assert/strict";

import {
  PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS,
  PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS,
  PUBLIC_QUOTE_PDF_IP_MAX_ATTEMPTS,
  PUBLIC_QUOTE_PDF_TOKEN_MAX_ATTEMPTS,
  PUBLIC_QUOTE_READ_ACTIONS,
  PUBLIC_QUOTE_VIEW_IP_MAX_ATTEMPTS,
  PUBLIC_QUOTE_VIEW_TOKEN_MAX_ATTEMPTS,
  publicQuoteCapsForAction,
  publicQuoteRateLimitKeyPrefix,
} from "../../src/lib/public-quote-rate-limit-buckets.js";

/**
 * Contract tests for the public-quote rate-limit bucket scheme.
 *
 * These import the REAL production helpers from
 * @/lib/public-quote-rate-limit-buckets, so a future change to the
 * caps or the cap-resolver (e.g. accidentally lumping "approval" into
 * the read tier, or promoting a PDF flood into the JSON-view bucket)
 * fails this test immediately rather than slipping past.
 *
 * The production rate-limit code in @/lib/rate-limit imports these
 * same helpers, so this test pins the cross-module invariant.
 */

test("exported cap constants are stable", () => {
  // Pin the public API. If any of these change you MUST update the
  // module's header comment AND inspect every caller that might rely
  // on the previous numbers.
  assert.equal(PUBLIC_QUOTE_VIEW_IP_MAX_ATTEMPTS, 40);
  assert.equal(PUBLIC_QUOTE_VIEW_TOKEN_MAX_ATTEMPTS, 25);
  assert.equal(PUBLIC_QUOTE_PDF_IP_MAX_ATTEMPTS, 40);
  assert.equal(PUBLIC_QUOTE_PDF_TOKEN_MAX_ATTEMPTS, 25);
  assert.equal(PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS, 15);
  assert.equal(PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS, 10);
});

test("PUBLIC_QUOTE_READ_ACTIONS contains exactly the read-like actions", () => {
  // The set must NOT include any write action. If a future change
  // adds e.g. "approval" or "requests" here, the mutation-tier caps
  // would silently relax for that action, which is a serious
  // regression of the intended security posture.
  assert.equal(PUBLIC_QUOTE_READ_ACTIONS.has("view"), true);
  assert.equal(PUBLIC_QUOTE_READ_ACTIONS.has("pdf"), true);
  // Write actions must not be here:
  for (const writeAction of ["approval", "requests", "sign", "respond"]) {
    assert.equal(
      PUBLIC_QUOTE_READ_ACTIONS.has(writeAction),
      false,
      `${writeAction} must NOT be in PUBLIC_QUOTE_READ_ACTIONS`,
    );
  }
});

test("view and pdf actions occupy distinct key namespaces", () => {
  // Critical invariant: a flood of PDF downloads must not consume the
  // JSON-view budget (and vice versa). The keys differ by the action
  // segment, so each lives in its own row in the auth_rate_limits
  // table and its own slot in the memory store.
  assert.notEqual(
    publicQuoteRateLimitKeyPrefix("view", "ip"),
    publicQuoteRateLimitKeyPrefix("pdf", "ip"),
  );
  assert.notEqual(
    publicQuoteRateLimitKeyPrefix("view", "token"),
    publicQuoteRateLimitKeyPrefix("pdf", "token"),
  );
});

test("pdf and view get the same read-tier caps (read-only parity)", () => {
  // We deliberately give PDF the same caps as view rather than the
  // stricter mutation caps because PDF is a GET, not a state change.
  const view = publicQuoteCapsForAction("view");
  const pdf = publicQuoteCapsForAction("pdf");
  assert.equal(pdf.ip, view.ip);
  assert.equal(pdf.token, view.token);
});

test("read tier caps match the exported view constants", () => {
  // The cap-resolver MUST return the constants verbatim — no scaling
  // factor, no env-driven override. If it ever does, this test fires.
  const view = publicQuoteCapsForAction("view");
  assert.equal(view.ip, PUBLIC_QUOTE_VIEW_IP_MAX_ATTEMPTS);
  assert.equal(view.token, PUBLIC_QUOTE_VIEW_TOKEN_MAX_ATTEMPTS);
});

test("pdf caps match the exported pdf constants", () => {
  const pdf = publicQuoteCapsForAction("pdf");
  assert.equal(pdf.ip, PUBLIC_QUOTE_PDF_IP_MAX_ATTEMPTS);
  assert.equal(pdf.token, PUBLIC_QUOTE_PDF_TOKEN_MAX_ATTEMPTS);
});

test("write actions stay in the stricter mutation bucket", () => {
  // approval/requests/anything-else must NOT accidentally fall into
  // the read bucket. If a future contributor adds them to
  // PUBLIC_QUOTE_READ_ACTIONS, this test fires.
  for (const action of ["approval", "requests", "anything-else", "sign"]) {
    const caps = publicQuoteCapsForAction(action);
    assert.equal(caps.ip, PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS);
    assert.equal(caps.token, PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS);
  }
});

test("read tier is strictly more generous than mutation tier", () => {
  // Documenting the ordering — if these flip, something is wrong with
  // the tier assignment.
  const view = publicQuoteCapsForAction("view");
  assert.equal(view.ip > PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS, true);
  assert.equal(view.token > PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS, true);
});

test("key prefix format matches the production format `public-quote:${action}:${kind}`", () => {
  // Format guard. If anyone changes the key prefix, every persisted
  // counter in the auth_rate_limits table would silently reset because
  // the row would never be found — that's a stealthy regression we
  // want to break loudly.
  assert.equal(publicQuoteRateLimitKeyPrefix("pdf", "token"), "public-quote:pdf:token");
  assert.equal(publicQuoteRateLimitKeyPrefix("view", "ip"), "public-quote:view:ip");
  assert.equal(
    publicQuoteRateLimitKeyPrefix("approval", "token"),
    "public-quote:approval:token",
  );
});
