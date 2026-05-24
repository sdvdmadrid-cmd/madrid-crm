import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWebsiteSlug,
  isReservedWebsiteSlug,
} from "../../src/lib/public-website-routing.js";
import { parsePublicWebsiteSlug } from "../../src/lib/public-website-routing.js";

test("normalizeWebsiteSlug lowercases and hyphenates", () => {
  assert.equal(normalizeWebsiteSlug("Acme Plumbing LLC"), "acme-plumbing-llc");
  assert.equal(normalizeWebsiteSlug("  foo_bar  "), "foo-bar");
});

test("parsePublicWebsiteSlug decodes URI segments", () => {
  assert.equal(parsePublicWebsiteSlug("acme-plumbing"), "acme-plumbing");
  assert.equal(parsePublicWebsiteSlug(encodeURIComponent("Acme Co")), "acme-co");
});

test("reserved slugs are blocked for new sites", () => {
  assert.equal(isReservedWebsiteSlug("api"), true);
  assert.equal(isReservedWebsiteSlug("my-company"), false);
});
