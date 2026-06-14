import test from "node:test";
import assert from "node:assert/strict";
import { shouldRunOperationsAgent } from "../../src/lib/workspace-agent/operations-intent.js";
import { resolveDateRange } from "../../src/lib/workspace-agent/tools/date-range.js";

test("shouldRunOperationsAgent detects create estimate intent", () => {
  assert.equal(
    shouldRunOperationsAgent({
      message: "Create an estimate for John Smith for spring cleanup",
      agentMode: true,
      pageId: "dashboard",
    }),
    true,
  );
});

test("shouldRunOperationsAgent skips website-only slash on builder", () => {
  assert.equal(
    shouldRunOperationsAgent({
      message: "/audit",
      agentMode: true,
      pageId: "website_builder",
    }),
    false,
  );
});

test("shouldRunOperationsAgent runs ops slash on website builder", () => {
  assert.equal(
    shouldRunOperationsAgent({
      message: "/invoice unpaid",
      agentMode: true,
      pageId: "website_builder",
    }),
    true,
  );
});

test("shouldRunOperationsAgent defaults to ops on general pages", () => {
  assert.equal(
    shouldRunOperationsAgent({
      message: "What should I focus on today?",
      agentMode: true,
      pageId: "dashboard",
    }),
    true,
  );
});

test("shouldRunOperationsAgent requires agent mode", () => {
  assert.equal(
    shouldRunOperationsAgent({
      message: "Create an estimate for Jane",
      agentMode: false,
      pageId: "dashboard",
    }),
    false,
  );
});

test("resolveDateRange defaults to this week", () => {
  const range = resolveDateRange({ range: "this_week" });
  assert.match(range.from, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(range.to, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(range.from <= range.to);
});

test("resolveDateRange accepts explicit from/to", () => {
  assert.deepEqual(
    resolveDateRange({ from: "2026-06-01", to: "2026-06-07" }),
    { from: "2026-06-01", to: "2026-06-07" },
  );
});
