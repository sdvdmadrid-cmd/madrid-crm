import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeAgentSummaries,
  normalizeAgentSummaries,
} from "../../src/lib/workspace-agent/client-executor.js";

test("normalizeAgentSummaries coerces non-arrays to empty list", () => {
  assert.deepEqual(normalizeAgentSummaries(null), []);
  assert.deepEqual(normalizeAgentSummaries(undefined), []);
  assert.deepEqual(normalizeAgentSummaries({}), []);
  assert.deepEqual(normalizeAgentSummaries("bad"), []);
});

test("normalizeAgentSummaries trims string entries", () => {
  assert.deepEqual(normalizeAgentSummaries(["  a  ", "", "b"]), ["a", "b"]);
});

test("mergeAgentSummaries handles Promise-like mistake without throwing", () => {
  const merged = mergeAgentSummaries(["Server"], { then: () => {} });
  assert.deepEqual(merged, ["Server"]);
});

test("mergeAgentSummaries dedupes server and client summaries", () => {
  const merged = mergeAgentSummaries(["Created invoice"], ["Opened /clients"]);
  assert.deepEqual(merged, ["Created invoice", "Opened /clients"]);
});
