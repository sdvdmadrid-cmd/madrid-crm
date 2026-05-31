import test from "node:test";
import assert from "node:assert/strict";
import { detectWorkspaceIntents, intentRequiresConfirmation } from "../../src/lib/workspace-agent/intents.js";
import { resolvePageFromPathname } from "../../src/lib/workspace-agent/pages.js";

test("detectWorkspaceIntents matches common website commands", () => {
  const intents = detectWorkspaceIntents(
    "Remove pricing from service cards and fix gallery loading",
  );
  assert.ok(intents.includes("website.remove_pricing"));
  assert.ok(intents.includes("website.fix_gallery"));
});

test("intentRequiresConfirmation flags bulk website edits", () => {
  assert.equal(intentRequiresConfirmation(["website.landscaping_catalog"]), true);
  assert.equal(intentRequiresConfirmation(["website.improve_seo"]), false);
});

test("resolvePageFromPathname maps website builder route", () => {
  const page = resolvePageFromPathname("/website");
  assert.equal(page.id, "website_builder");
  assert.ok(page.capabilities.includes("website.services"));
});
