import assert from "node:assert/strict";
import test from "node:test";
import { isApiSyncedReview, buildExternalId } from "../../src/lib/reputation-sync/shared.js";
import { parseYelpBusinessIdFromUrl } from "../../src/lib/reputation-sync/shared.js";
import { sanitizeReputationSyncError } from "../../src/lib/reputation-sync/shared.js";

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

test("sanitizeReputationSyncError hides API key names from contractors", () => {
  assert.match(
    sanitizeReputationSyncError("GOOGLE_PLACES_API_KEY is not configured", "google"),
    /temporarily unavailable/i,
  );
  assert.match(
    sanitizeReputationSyncError("YELP_FUSION_API_KEY not configured", "yelp"),
    /temporarily unavailable/i,
  );
  assert.doesNotMatch(
    sanitizeReputationSyncError("GOOGLE_PLACES_API_KEY missing", "google"),
    /GOOGLE_PLACES/i,
  );
});
