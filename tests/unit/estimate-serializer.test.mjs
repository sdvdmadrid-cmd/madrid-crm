import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeEstimateStatusToken,
  serializeEstimateBase,
  toNumber,
} from "../../src/lib/estimate-serializer.js";
import { ESTIMATE_NOTES_KIND } from "../../src/lib/estimate-notes.js";

// Pin the contract for the shared estimate serializer used by 5
// routes (list/read/PDF auth/PDF public/public JSON view). Before
// this module existed, each route had its own ~30-line serializer
// with subtle drift (NaN-prone Number coercion, inconsistent
// status normalization, sometimes-missing audit field).

// ── toNumber ───────────────────────────────────────────────────────

test("toNumber returns finite values unchanged", () => {
  assert.equal(toNumber(0), 0);
  assert.equal(toNumber(1), 1);
  assert.equal(toNumber(1.5), 1.5);
  assert.equal(toNumber(-3.14), -3.14);
});

test("toNumber coerces numeric strings", () => {
  assert.equal(toNumber("1.5"), 1.5);
  assert.equal(toNumber("0"), 0);
});

test("toNumber returns fallback for NaN / Infinity / non-numeric strings", () => {
  // These were all silent NaN in the previous Number(x || 0)
  // shape used by the PDF routes — fixed here.
  assert.equal(toNumber("abc"), 0);
  assert.equal(toNumber(Number.NaN), 0);
  assert.equal(toNumber(Number.POSITIVE_INFINITY), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(""), 0);
});

test("toNumber respects custom fallback for unparseable inputs", () => {
  // Only inputs that produce NaN (string "abc") use the fallback.
  // null and "" coerce cleanly via Number() to 0 — finite — so they
  // return 0, not the fallback. This matches the inlined behavior
  // of the routes before the extraction; the helper is a 1:1
  // replacement.
  assert.equal(toNumber("abc", -1), -1);
  assert.equal(toNumber(Number.NaN, 42), 42);
  // null -> Number(null) === 0 (finite), so fallback is NOT used.
  assert.equal(toNumber(null, 42), 0);
});

// ── normalizeEstimateStatusToken ───────────────────────────────────

test("normalizeEstimateStatusToken accepts canonical tokens", () => {
  for (const status of [
    "draft",
    "sent",
    "approved",
    "declined",
    "changes_requested",
  ]) {
    assert.equal(normalizeEstimateStatusToken(status), status);
  }
});

test("normalizeEstimateStatusToken is case-insensitive and trims", () => {
  assert.equal(normalizeEstimateStatusToken("  Sent "), "sent");
  assert.equal(normalizeEstimateStatusToken("APPROVED"), "approved");
});

test("normalizeEstimateStatusToken falls back for unknown values", () => {
  assert.equal(normalizeEstimateStatusToken("archived"), "draft");
  assert.equal(normalizeEstimateStatusToken(""), "draft");
  assert.equal(normalizeEstimateStatusToken(null), "draft");
  assert.equal(normalizeEstimateStatusToken(undefined), "draft");
  // Custom fallback honored
  assert.equal(normalizeEstimateStatusToken("xyz", "sent"), "sent");
});

// ── serializeEstimateBase ──────────────────────────────────────────

function rowFixture(overrides = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenant_id: "22222222-2222-2222-2222-222222222222",
    user_id: "33333333-3333-3333-3333-333333333333",
    created_by: "44444444-4444-4444-4444-444444444444",
    client_name: "Acme Co",
    notes: JSON.stringify({
      kind: ESTIMATE_NOTES_KIND,
      address: "1 Main St",
      noteText: "scope of work",
      clientEmail: "a@example.com",
      clientPhone: "+15550001234",
      audit: {
        sentAt: "2026-05-20T00:00:00Z",
        approvedAt: "",
        declinedAt: "",
        changesRequestedAt: "",
        resentAt: "",
        resendCount: 0,
      },
    }),
    items: [{ name: "Service A", qty: 1, unitPrice: 100 }],
    subtotal: 100,
    tax: 10,
    total: 110,
    status: "sent",
    estimate_number: "EST-0001",
    created_at: "2026-05-20T00:00:00Z",
    updated_at: "2026-05-20T01:00:00Z",
    ...overrides,
  };
}

test("serializeEstimateBase produces the canonical camelCase shape", () => {
  const payload = serializeEstimateBase(rowFixture());
  assert.equal(payload.id, "11111111-1111-1111-1111-111111111111");
  assert.equal(payload._id, payload.id);
  assert.equal(payload.tenantId, "22222222-2222-2222-2222-222222222222");
  assert.equal(payload.userId, "33333333-3333-3333-3333-333333333333");
  assert.equal(payload.createdBy, "44444444-4444-4444-4444-444444444444");
  assert.equal(payload.clientName, "Acme Co");
  assert.equal(payload.clientEmail, "a@example.com");
  assert.equal(payload.clientPhone, "+15550001234");
  assert.equal(payload.address, "1 Main St");
  assert.equal(payload.status, "sent");
  assert.deepEqual(payload.services, [
    { name: "Service A", qty: 1, unitPrice: 100 },
  ]);
  assert.equal(payload.subtotal, 100);
  assert.equal(payload.tax, 10);
  assert.equal(payload.total, 110);
  assert.equal(payload.notes, "scope of work");
  assert.equal(payload.estimateNumber, "EST-0001");
  assert.equal(payload.createdAt, "2026-05-20T00:00:00Z");
  assert.equal(payload.updatedAt, "2026-05-20T01:00:00Z");
  // Audit shape present (full parsed audit)
  assert.equal(payload.audit.sentAt, "2026-05-20T00:00:00Z");
});

test("serializeEstimateBase normalizes status to a canonical token", () => {
  const payload = serializeEstimateBase(rowFixture({ status: "  SENT  " }));
  assert.equal(payload.status, "sent");
});

test("serializeEstimateBase coerces numeric fields safely", () => {
  // "abc" used to slip through Number(x || 0) -> NaN in PDF routes.
  // The base serializer now uses toNumber which guards against NaN.
  const payload = serializeEstimateBase(
    rowFixture({ subtotal: "abc", tax: null, total: undefined }),
  );
  assert.equal(payload.subtotal, 0);
  assert.equal(payload.tax, 0);
  assert.equal(payload.total, 0);
});

test("serializeEstimateBase tolerates a row with no notes blob", () => {
  // Legacy or partial rows may have notes=null / "". Must not crash.
  const payload = serializeEstimateBase(
    rowFixture({ notes: null, items: undefined }),
  );
  assert.equal(payload.notes, "");
  assert.equal(payload.address, "");
  assert.deepEqual(payload.services, []);
});

test("serializeEstimateBase tolerates an undefined / null row", () => {
  // Some PDF routes pass `data` directly without an existence check;
  // the helper should not throw on a falsy input.
  const payload = serializeEstimateBase(null);
  assert.equal(payload.id, undefined);
  assert.equal(payload.status, "draft");
  assert.deepEqual(payload.services, []);
});
