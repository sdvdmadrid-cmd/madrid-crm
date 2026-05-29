import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFacebookShareUrl,
  buildTwitterShareUrl,
} from "../../src/lib/social-share.js";

test("buildFacebookShareUrl encodes target URL", () => {
  const url = buildFacebookShareUrl("https://fieldbaseapp.net/quote/abc");
  assert.ok(url.includes("facebook.com/sharer"));
  assert.ok(url.includes(encodeURIComponent("https://fieldbaseapp.net/quote/abc")));
});

test("buildTwitterShareUrl includes text when provided", () => {
  const url = buildTwitterShareUrl("https://fieldbaseapp.net/q/1", "My quote");
  assert.ok(url.includes("twitter.com/intent/tweet"));
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("text"), "My quote");
  assert.equal(parsed.searchParams.get("url"), "https://fieldbaseapp.net/q/1");
});
