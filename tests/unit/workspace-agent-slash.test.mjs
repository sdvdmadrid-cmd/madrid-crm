import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSlashCommand,
  resolveAgentMessage,
} from "../../src/lib/workspace-agent/slash-commands.js";
import {
  patchRequiresConfirmation,
  isHeroOnlyPatch,
} from "../../src/lib/workspace-agent/patch-risk.js";
import { intentRequiresConfirmation } from "../../src/lib/workspace-agent/intents.js";

test("parseSlashCommand /hero passes tone", () => {
  const slash = parseSlashCommand("/hero bold");
  assert.equal(slash.command, "hero");
  assert.equal(slash.args, "bold");
  assert.ok(slash.expandedMessage.includes("bold"));
  assert.ok(slash.intentIds.includes("website.improve_hero"));
});

test("/leads contacted adds mark intent", () => {
  const slash = parseSlashCommand("/leads contacted");
  assert.ok(slash.intentIds.includes("crm.mark_new_contacted"));
});

test("/help returns help text", () => {
  const resolved = resolveAgentMessage("/help");
  assert.ok(resolved.helpText?.includes("/audit"));
});

test("hero-only patches skip confirmation", () => {
  const patches = { headline: "New Headline", subheadline: "New sub", ctaText: "Get Quote" };
  assert.equal(isHeroOnlyPatch(patches), true);
  assert.equal(patchRequiresConfirmation(patches), false);
});

test("service replacement requires confirmation", () => {
  assert.equal(intentRequiresConfirmation(["website.landscaping_catalog"]), true);
  assert.equal(
    patchRequiresConfirmation({ services: [{ name: "A" }, { name: "B" }] }),
    true,
  );
});
