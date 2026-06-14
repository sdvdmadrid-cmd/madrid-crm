import assert from "node:assert/strict";
import test from "node:test";
import { resolvePostLoginPath } from "../../src/lib/auth-redirect.js";
import {
  EXPIRED_TRIAL_SUBSCRIBE_PATH,
  isSubscriptionExemptPage,
  shouldRestrictForSubscription,
} from "../../src/lib/subscription-routes.js";

test("expired trial users resolve to /subscribe", () => {
  const user = {
    userId: "user-1",
    role: "admin",
    hasBusinessAccess: false,
    isSubscribed: false,
  };
  assert.equal(resolvePostLoginPath(user, "/dashboard"), "/subscribe");
  assert.equal(shouldRestrictForSubscription(user), true);
});

test("active subscribers keep dashboard redirect", () => {
  const user = {
    userId: "user-2",
    role: "admin",
    hasBusinessAccess: true,
    isSubscribed: true,
  };
  assert.equal(resolvePostLoginPath(user, "/dashboard"), "/dashboard");
  assert.equal(shouldRestrictForSubscription(user), false);
});

test("subscribe page is subscription exempt", () => {
  assert.equal(isSubscriptionExemptPage("/subscribe"), true);
  assert.equal(isSubscriptionExemptPage("/dashboard"), false);
  assert.equal(EXPIRED_TRIAL_SUBSCRIBE_PATH, "/subscribe");
});
