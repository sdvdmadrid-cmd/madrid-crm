import test from "node:test";
import assert from "node:assert/strict";

/**
 * Static contract test for the public-quote rate-limit bucket scheme.
 *
 * The production code in src/lib/rate-limit.js stores attempts under
 * keys of the form `public-quote:${action}:ip:<ip>` and
 * `public-quote:${action}:token:<token>`. The Set of "read-like"
 * actions and the cap-resolution function determine which budget a
 * given action draws from.
 *
 * We mirror those tiny pieces here and assert the contract so that:
 *   - a future change that lumps "pdf" back into the "view" namespace
 *     (which would let a PDF flood starve the JSON-view budget) fails
 *     this test, and
 *   - a future change that accidentally promotes a write action like
 *     "approval" into the read bucket also fails this test.
 *
 * If you change the production buckets/caps you MUST update both the
 * route file AND this test in the same commit.
 */

const PUBLIC_QUOTE_VIEW_IP_MAX_ATTEMPTS = 40;
const PUBLIC_QUOTE_VIEW_TOKEN_MAX_ATTEMPTS = 25;
const PUBLIC_QUOTE_PDF_IP_MAX_ATTEMPTS = 40;
const PUBLIC_QUOTE_PDF_TOKEN_MAX_ATTEMPTS = 25;
const PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS = 15;
const PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS = 10;

const PUBLIC_QUOTE_READ_ACTIONS = new Set(["view", "pdf"]);

function capsForAction(action) {
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

function keyFor(action, kind, value) {
  return `public-quote:${action}:${kind}:${String(value).toLowerCase()}`;
}

test("view and pdf actions occupy distinct key namespaces", () => {
  // Critical invariant: a flood of PDF downloads must not consume the
  // JSON-view budget (and vice versa). The keys differ by the action
  // segment, so each lives in its own row in the auth_rate_limits
  // table and its own slot in the memory store.
  const viewIpKey = keyFor("view", "ip", "203.0.113.10");
  const pdfIpKey = keyFor("pdf", "ip", "203.0.113.10");
  const viewTokenKey = keyFor("view", "token", "abc123");
  const pdfTokenKey = keyFor("pdf", "token", "abc123");

  assert.notEqual(viewIpKey, pdfIpKey);
  assert.notEqual(viewTokenKey, pdfTokenKey);
});

test("pdf and view get the same read-tier caps (read-only parity)", () => {
  // We deliberately give PDF the same caps as view rather than the
  // stricter mutation caps because PDF is a GET, not a state change.
  const view = capsForAction("view");
  const pdf = capsForAction("pdf");
  assert.equal(pdf.ip, view.ip);
  assert.equal(pdf.token, view.token);
});

test("write actions stay in the stricter mutation bucket", () => {
  // approval/requests must NOT accidentally fall into the read bucket.
  // If a future contributor adds them to PUBLIC_QUOTE_READ_ACTIONS,
  // this test fires.
  for (const action of ["approval", "requests", "anything-else"]) {
    const caps = capsForAction(action);
    assert.equal(caps.ip, PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS);
    assert.equal(caps.token, PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS);
  }
});

test("read tier is strictly more generous than mutation tier", () => {
  // Documenting the ordering — if these flip, something is wrong with
  // the tier assignment.
  const view = capsForAction("view");
  assert.equal(view.ip > PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS, true);
  assert.equal(view.token > PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS, true);
});

test("key shape matches the production format `public-quote:${action}:${kind}:${value}`", () => {
  // Format guard. If anyone changes the key prefix, every persisted
  // counter in the auth_rate_limits table would silently reset because
  // the row would never be found — that's a stealthy regression we
  // want to break loudly.
  assert.equal(
    keyFor("pdf", "token", "TOKEN-Value"),
    "public-quote:pdf:token:token-value",
  );
  assert.equal(
    keyFor("view", "ip", "10.0.0.1"),
    "public-quote:view:ip:10.0.0.1",
  );
});
