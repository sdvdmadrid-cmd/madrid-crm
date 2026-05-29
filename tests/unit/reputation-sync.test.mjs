import assert from "node:assert/strict";
import test from "node:test";
import { isApiSyncedReview, buildExternalId } from "../../src/lib/reputation-sync/shared.js";
import { parseYelpBusinessIdFromUrl } from "../../src/lib/reputation-sync/shared.js";

test("isApiSyncedReview requires api sync and verified", () => {
  assert.equal(
    isApiSyncedReview({ verified: true, metadata: { syncSource: "api" } }),
    true,
  );
  assert.equal(
    isApiSyncedReview({ verified: true, metadata: { syncSource: "manual" } }),
    false,
  );
  assert.equal(
    isApiSyncedReview({ verified: false, metadata: { syncSource: "api" } }),
    false,
  );
});

test("buildExternalId prefers explicit id", () => {
  assert.equal(buildExternalId("yelp", { externalId: "abc123" }), "yelp:abc123");
});

test("parseYelpBusinessIdFromUrl extracts biz slug", () => {
  assert.equal(
    parseYelpBusinessIdFromUrl("https://www.yelp.com/biz/madrid-landscaping-chicago"),
    "madrid-landscaping-chicago",
  );
  assert.equal(parseYelpBusinessIdFromUrl(""), "");
});
