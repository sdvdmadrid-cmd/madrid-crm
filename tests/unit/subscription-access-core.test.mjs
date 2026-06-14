import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSubscriptionBypassPath,
  isTrialActive,
  resolveSubscriptionAccess,
  SUBSCRIPTION_ALLOWED_API_PREFIXES,
  SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
  SUBSCRIPTION_STATES,
} from "../../src/lib/subscription-access-core.js";

describe("subscription-access-core", () => {
  it("allows active trial users full business access", () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const access = resolveSubscriptionAccess({
      role: "owner",
      isSubscribed: false,
      trialEndDate: future,
    });
    assert.equal(access.hasBusinessAccess, true);
    assert.equal(access.state, SUBSCRIPTION_STATES.TRIAL);
  });

  it("restricts expired trial users without subscription", () => {
    const access = resolveSubscriptionAccess({
      role: "owner",
      isSubscribed: false,
      trialEndDate: "2020-01-01T00:00:00.000Z",
    });
    assert.equal(access.hasBusinessAccess, false);
    assert.equal(access.isRestricted, true);
    assert.equal(access.state, SUBSCRIPTION_STATES.EXPIRED_TRIAL);
  });

  it("restricts past_due stripe subscriptions", () => {
    const access = resolveSubscriptionAccess({
      role: "owner",
      isSubscribed: true,
      stripeSubscriptionStatus: "past_due",
    });
    assert.equal(access.hasBusinessAccess, false);
    assert.equal(access.state, SUBSCRIPTION_STATES.PAST_DUE);
  });

  it("allows active stripe subscribers", () => {
    const access = resolveSubscriptionAccess({
      role: "owner",
      isSubscribed: false,
      stripeSubscriptionStatus: "active",
    });
    assert.equal(access.hasBusinessAccess, true);
    assert.equal(access.state, SUBSCRIPTION_STATES.ACTIVE);
  });

  it("allows subscribe/legal paths when restricted", () => {
    assert.equal(
      isSubscriptionBypassPath(
        "/subscribe",
        SUBSCRIPTION_ALLOWED_API_PREFIXES,
        SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
      ),
      true,
    );
    assert.equal(
      isSubscriptionBypassPath(
        "/legal-required",
        SUBSCRIPTION_ALLOWED_API_PREFIXES,
        SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
      ),
      true,
    );
    assert.equal(
      isSubscriptionBypassPath(
        "/settings/company",
        SUBSCRIPTION_ALLOWED_API_PREFIXES,
        SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
      ),
      false,
    );
    assert.equal(
      isSubscriptionBypassPath(
        "/dashboard",
        SUBSCRIPTION_ALLOWED_API_PREFIXES,
        SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
      ),
      false,
    );
    assert.equal(
      isSubscriptionBypassPath(
        "/api/clients",
        SUBSCRIPTION_ALLOWED_API_PREFIXES,
        SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
      ),
      false,
    );
  });

  it("detects active trial window", () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isTrialActive(future), true);
    assert.equal(isTrialActive("2020-01-01T00:00:00.000Z"), false);
  });
});
