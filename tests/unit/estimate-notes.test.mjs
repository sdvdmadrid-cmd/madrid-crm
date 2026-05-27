import test from "node:test";
import assert from "node:assert/strict";
import {
  ESTIMATE_NOTES_KIND,
  buildAuditForCreate,
  buildAuditForStatusTransition,
  createEmptyAudit,
  parseEstimateNotes,
  redactAuditForPublic,
  stringifyEstimateNotes,
} from "../../src/lib/estimate-notes.js";

test("parseEstimateNotes returns empty defaults on blank input", () => {
  const result = parseEstimateNotes("");
  assert.equal(result.address, "");
  assert.equal(result.noteText, "");
  assert.equal(result.audit.resendCount, 0);
  assert.equal(result.audit.signature, null);
});

test("parseEstimateNotes treats legacy plain text as noteText", () => {
  const result = parseEstimateNotes("Free-form scope of work");
  assert.equal(result.noteText, "Free-form scope of work");
  assert.equal(result.address, "");
  assert.equal(result.audit.signature, null);
});

test("parseEstimateNotes pulls audit.signature.ip from the canonical blob", () => {
  const blob = JSON.stringify({
    kind: ESTIMATE_NOTES_KIND,
    noteText: "Hello",
    address: "1 Main St",
    clientEmail: "Jane@Example.com",
    clientPhone: "555-0100",
    audit: {
      sentAt: "2026-01-01T00:00:00Z",
      approvedAt: "2026-01-02T00:00:00Z",
      resendCount: 2,
      signature: { name: "Jane", signedAt: "2026-01-02T00:00:00Z", ip: "1.2.3.4" },
    },
  });
  const result = parseEstimateNotes(blob);
  assert.equal(result.noteText, "Hello");
  assert.equal(result.audit.resendCount, 2);
  assert.equal(result.audit.signature.name, "Jane");
  assert.equal(result.audit.signature.ip, "1.2.3.4");
  // Older signatures predate the method/dataUrl fields; the normalizer
  // defaults `method` to "typed" and omits `dataUrl`.
  assert.equal(result.audit.signature.method, "typed");
  assert.equal("dataUrl" in result.audit.signature, false);
});

test("parseEstimateNotes preserves drawn-signature dataUrl + method", () => {
  const blob = JSON.stringify({
    kind: ESTIMATE_NOTES_KIND,
    noteText: "Hello",
    audit: {
      signature: {
        name: "Jane",
        signedAt: "T",
        ip: "1.2.3.4",
        method: "drawn_and_typed",
        dataUrl: "data:image/png;base64,iVBORw0",
      },
    },
  });
  const result = parseEstimateNotes(blob);
  assert.equal(result.audit.signature.method, "drawn_and_typed");
  assert.equal(result.audit.signature.dataUrl, "data:image/png;base64,iVBORw0");
});

test("parseEstimateNotes drops non-data-URL signature.dataUrl values", () => {
  const blob = JSON.stringify({
    kind: ESTIMATE_NOTES_KIND,
    audit: {
      signature: {
        name: "Jane",
        signedAt: "T",
        dataUrl: "https://evil.example/track.gif",
      },
    },
  });
  const result = parseEstimateNotes(blob);
  assert.equal("dataUrl" in result.audit.signature, false);
});

test("parseEstimateNotes falls back to legacy parsed.note key", () => {
  const blob = JSON.stringify({
    kind: ESTIMATE_NOTES_KIND,
    note: "Legacy scope",
  });
  const result = parseEstimateNotes(blob);
  assert.equal(result.noteText, "Legacy scope");
});

test("stringifyEstimateNotes round-trips through parseEstimateNotes", () => {
  const audit = createEmptyAudit();
  audit.sentAt = "2026-01-01T00:00:00Z";
  audit.signature = { name: "Jane", signedAt: "2026-01-02T00:00:00Z", ip: "1.2.3.4" };
  const serialized = stringifyEstimateNotes({
    address: "1 Main",
    noteText: "Scope",
    clientEmail: "j@example.com",
    clientPhone: "555",
    audit,
  });
  const back = parseEstimateNotes(serialized);
  assert.equal(back.address, "1 Main");
  assert.equal(back.noteText, "Scope");
  assert.equal(back.audit.sentAt, "2026-01-01T00:00:00Z");
  assert.equal(back.audit.signature.ip, "1.2.3.4");
});

test("stringifyEstimateNotes omits requestedItems when null", () => {
  const serialized = stringifyEstimateNotes({ noteText: "x", audit: createEmptyAudit() });
  const parsed = JSON.parse(serialized);
  assert.equal("requestedItems" in parsed, false);
});

test("stringifyEstimateNotes includes requestedItems when array provided", () => {
  const serialized = stringifyEstimateNotes({
    noteText: "x",
    audit: createEmptyAudit(),
    requestedItems: ["replace tile"],
  });
  const parsed = JSON.parse(serialized);
  assert.deepEqual(parsed.requestedItems, ["replace tile"]);
});

test("buildAuditForCreate stamps the matching timestamp for the create status", () => {
  const audit = buildAuditForCreate("sent", "2026-05-01T00:00:00Z");
  assert.equal(audit.sentAt, "2026-05-01T00:00:00Z");
  assert.equal(audit.approvedAt, "");
});

test("buildAuditForStatusTransition: first sent stamps sentAt", () => {
  const audit = buildAuditForStatusTransition(createEmptyAudit(), "draft", "sent", "T1");
  assert.equal(audit.sentAt, "T1");
  assert.equal(audit.resendCount, 0);
});

test("buildAuditForStatusTransition: resend after changes_requested bumps resendCount", () => {
  const existing = createEmptyAudit();
  existing.sentAt = "T0";
  existing.changesRequestedAt = "T0.5";
  const audit = buildAuditForStatusTransition(existing, "changes_requested", "sent", "T2");
  assert.equal(audit.sentAt, "T0");
  assert.equal(audit.resentAt, "T2");
  assert.equal(audit.resendCount, 1);
});

test("buildAuditForStatusTransition: no-op when status unchanged", () => {
  const existing = createEmptyAudit();
  existing.sentAt = "T0";
  const audit = buildAuditForStatusTransition(existing, "sent", "sent", "T2");
  assert.equal(audit.sentAt, "T0");
  assert.equal(audit.resentAt, "");
});

test("buildAuditForStatusTransition: approved stamps approvedAt", () => {
  const audit = buildAuditForStatusTransition(createEmptyAudit(), "sent", "approved", "T3");
  assert.equal(audit.approvedAt, "T3");
});

test("redactAuditForPublic strips signature.ip", () => {
  const audit = createEmptyAudit();
  audit.signature = { name: "Jane", signedAt: "T1", ip: "1.2.3.4" };
  const redacted = redactAuditForPublic(audit);
  assert.equal(redacted.signature.name, "Jane");
  assert.equal(redacted.signature.signedAt, "T1");
  assert.equal("ip" in redacted.signature, false);
});

test("redactAuditForPublic echoes drawn signature back to the customer", () => {
  const audit = createEmptyAudit();
  audit.signature = {
    name: "Jane",
    signedAt: "T1",
    ip: "1.2.3.4",
    method: "drawn_and_typed",
    dataUrl: "data:image/png;base64,abc",
  };
  const redacted = redactAuditForPublic(audit);
  assert.equal(redacted.signature.method, "drawn_and_typed");
  assert.equal(redacted.signature.dataUrl, "data:image/png;base64,abc");
  assert.equal("ip" in redacted.signature, false);
});

test("redactAuditForPublic returns null signature when audit has no signature", () => {
  const redacted = redactAuditForPublic(createEmptyAudit());
  assert.equal(redacted.signature, null);
});

test("parseEstimateNotes round-trips requestedItems through stringify", () => {
  // Regression guard for the PATCH-drops-requestedItems bug (F1).
  // The contractor PATCH path now reads existingNotes.requestedItems
  // and threads it back through stringifyEstimateNotes. This test
  // pins the round-trip so a future change to either helper that
  // breaks the contract gets caught.
  const items = [
    { ref: "svc-a", change: "Swap to bronze frame" },
    { ref: "svc-b", change: "Reduce trim scope" },
  ];
  const blob = stringifyEstimateNotes({
    address: "1 Main St",
    noteText: "Original scope",
    requestedItems: items,
    audit: createEmptyAudit(),
  });
  const parsed = parseEstimateNotes(blob);
  assert.deepEqual(parsed.requestedItems, items);
  assert.equal(parsed.address, "1 Main St");
  assert.equal(parsed.noteText, "Original scope");
});

test("stringifyEstimateNotes omits requestedItems when null (legacy 'no items' shape)", () => {
  const blob = stringifyEstimateNotes({
    address: "1 Main St",
    noteText: "scope",
    requestedItems: null,
    audit: createEmptyAudit(),
  });
  const decoded = JSON.parse(blob);
  // The key must not appear at all — older parsers that don't know
  // about the field would otherwise see `requestedItems: null` and
  // potentially blow up.
  assert.equal("requestedItems" in decoded, false);
});

test("stringifyEstimateNotes omits requestedItems when non-array (defensive)", () => {
  // If a caller accidentally passes a non-array (e.g. an object,
  // string, or number), we must not persist it — the contractor view
  // expects either an array or no key at all.
  for (const bogus of ["a", 42, { id: 1 }, true]) {
    const blob = stringifyEstimateNotes({
      address: "",
      noteText: "",
      requestedItems: bogus,
      audit: createEmptyAudit(),
    });
    const decoded = JSON.parse(blob);
    assert.equal(
      "requestedItems" in decoded,
      false,
      `non-array (${typeof bogus}) must be dropped`,
    );
  }
});
