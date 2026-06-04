import test from "node:test";
import assert from "node:assert/strict";
import { shouldRunOperationsAgent } from "../../src/lib/workspace-agent/operations-intent.js";

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
