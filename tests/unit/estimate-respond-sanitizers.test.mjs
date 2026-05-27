import test from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for the defensive sanitizers used by
 * /api/estimates/[id]/respond. The helpers are intentionally inlined
 * in the route file (App Router rejects non-handler exports from
 * route.js modules), so this test mirrors them. If you change the
 * route caps you MUST update both files.
 *
 * The route receives untrusted, public, token-gated input and writes
 * directly into the estimates.notes TEXT column. Without these caps a
 * malicious caller could bloat the row past Supabase's per-row soft
 * limit and slow every subsequent read, or stuff megabytes of garbage
 * that ride along on every PDF/email regeneration.
 */

const MAX_REQUESTED_ITEMS = 50;
const MAX_REQUESTED_ITEM_BYTES = 4 * 1024;
const MAX_REQUESTED_ITEMS_TOTAL_BYTES = 64 * 1024;
const MAX_CLIENT_NOTE_CHARS = 5 * 1024;

function sanitizeRequestedItems(value) {
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
    if (totalBytes + serialized.length > MAX_REQUESTED_ITEMS_TOTAL_BYTES) break;
    totalBytes += serialized.length;
    accepted.push(item);
  }
  return accepted.length > 0 ? accepted : null;
}

function sanitizeClientNote(value) {
  const raw = String(value || "");
  return raw.slice(0, MAX_CLIENT_NOTE_CHARS).trim();
}

test("requestedItems: non-array returns null", () => {
  assert.equal(sanitizeRequestedItems(undefined), null);
  assert.equal(sanitizeRequestedItems(null), null);
  assert.equal(sanitizeRequestedItems("a string"), null);
  assert.equal(sanitizeRequestedItems(42), null);
  assert.equal(sanitizeRequestedItems({ key: "value" }), null);
});

test("requestedItems: empty array returns null (legacy 'no items' shape)", () => {
  // Returning null rather than [] keeps stringifyEstimateNotes able to
  // omit the field entirely, which matches what existed before
  // requestedItems was introduced.
  assert.equal(sanitizeRequestedItems([]), null);
});

test("requestedItems: small valid payload passes through unchanged", () => {
  const input = [
    { itemId: "abc", qty: 2, note: "Wants the cheaper grade." },
    { itemId: "def", qty: 1 },
  ];
  const result = sanitizeRequestedItems(input);
  assert.deepEqual(result, input);
});

test("requestedItems: count cap truncates oversized arrays at MAX_REQUESTED_ITEMS", () => {
  const tooMany = Array.from({ length: MAX_REQUESTED_ITEMS + 10 }, (_, i) => ({
    id: i,
  }));
  const result = sanitizeRequestedItems(tooMany);
  assert.equal(result.length, MAX_REQUESTED_ITEMS);
  // First N kept in order
  assert.equal(result[0].id, 0);
  assert.equal(result[MAX_REQUESTED_ITEMS - 1].id, MAX_REQUESTED_ITEMS - 1);
});

test("requestedItems: drops a single item that exceeds the per-item byte cap", () => {
  const oversizedNote = "x".repeat(MAX_REQUESTED_ITEM_BYTES + 100);
  const input = [
    { id: 1, ok: true },
    { id: 2, note: oversizedNote },
    { id: 3, ok: true },
  ];
  const result = sanitizeRequestedItems(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 1);
  assert.equal(result[1].id, 3);
});

test("requestedItems: total-bytes cap stops accepting once exceeded", () => {
  // Each item is ~3KB serialized. Many of these together must hit the
  // 64KB total cap, which should stop accumulation before the count
  // cap kicks in.
  const chunk = "y".repeat(3 * 1024);
  const items = Array.from({ length: 40 }, (_, i) => ({ id: i, payload: chunk }));
  const result = sanitizeRequestedItems(items);
  const totalBytes = JSON.stringify(result).length;
  assert.equal(result.length < items.length, true, "must truncate at total cap");
  // Each accepted serialized item is well under MAX_REQUESTED_ITEM_BYTES,
  // so the cap that fires must be the TOTAL cap. Round up to a safe
  // ceiling for the inner array (JSON adds brackets and commas).
  assert.equal(
    totalBytes <= MAX_REQUESTED_ITEMS_TOTAL_BYTES + 4 * 1024,
    true,
    `total bytes ${totalBytes} should be <= cap + slack`,
  );
});

test("requestedItems: drops items that JSON.stringify can't serialize", () => {
  // Cycles return undefined from JSON.stringify (technically throw on
  // some inputs); we treat both as droppable.
  const cyclic = {};
  cyclic.self = cyclic;
  const input = [{ ok: 1 }, cyclic, { ok: 2 }];
  const result = sanitizeRequestedItems(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].ok, 1);
  assert.equal(result[1].ok, 2);
});

test("requestedItems: preserves order of accepted items", () => {
  // Important — the contractor reads these back as a list, and the
  // customer might be implying "swap A for B then C" in the same
  // submission. Reordering would silently change meaning.
  const input = [
    { tag: "first" },
    { tag: "second" },
    { tag: "third" },
  ];
  const result = sanitizeRequestedItems(input);
  assert.deepEqual(result.map((r) => r.tag), ["first", "second", "third"]);
});

test("clientNote: empty / nullish input returns empty string", () => {
  assert.equal(sanitizeClientNote(undefined), "");
  assert.equal(sanitizeClientNote(null), "");
  assert.equal(sanitizeClientNote(""), "");
});

test("clientNote: normal input is trimmed and preserved", () => {
  assert.equal(sanitizeClientNote("  hello world  "), "hello world");
});

test("clientNote: oversized input is truncated to MAX_CLIENT_NOTE_CHARS, then trimmed", () => {
  const huge = "a".repeat(MAX_CLIENT_NOTE_CHARS + 100);
  const result = sanitizeClientNote(huge);
  assert.equal(result.length, MAX_CLIENT_NOTE_CHARS);
});

test("clientNote: padding whitespace cannot smuggle real content past the cap", () => {
  // If trim ran BEFORE slice, an attacker could prepend MAX whitespace
  // characters and the trim would leave them ALL of the legitimate
  // budget for real content. Slice-then-trim is the safe order.
  const padded = "   ".repeat(MAX_CLIENT_NOTE_CHARS / 3) + "real content";
  const result = sanitizeClientNote(padded);
  // After slice the result is MAX_CLIENT_NOTE_CHARS of mostly
  // whitespace, then trim leaves whatever survives. Critically, the
  // result MUST NOT exceed MAX_CLIENT_NOTE_CHARS.
  assert.equal(result.length <= MAX_CLIENT_NOTE_CHARS, true);
});

test("clientNote: coerces non-string input via String(...)", () => {
  // The body comes from JSON.parse, so any type is possible. We must
  // coerce rather than throw, because the route still wants to write
  // the rest of the status transition successfully.
  assert.equal(sanitizeClientNote(42), "42");
  assert.equal(sanitizeClientNote(true), "true");
  // Objects stringify to "[object Object]" — undesirable but harmless,
  // and crucially does NOT throw.
  assert.equal(sanitizeClientNote({}), "[object Object]");
});
