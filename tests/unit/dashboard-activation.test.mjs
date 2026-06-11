import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlatformActivated,
  shouldForceDashboardOnboarding,
  shouldShowDashboardOnboarding,
} from "../../src/lib/dashboard-activation.js";

test("isPlatformActivated is false for empty metrics", () => {
  assert.equal(isPlatformActivated(null), false);
  assert.equal(isPlatformActivated({ clients: { total: 0 }, jobs: { total: 0 } }), false);
});

test("isPlatformActivated is true when any core entity exists", () => {
  assert.equal(isPlatformActivated({ clients: { total: 1 } }), true);
  assert.equal(isPlatformActivated({ jobs: { total: 2 } }), true);
  assert.equal(isPlatformActivated({ invoices: { total: 1 } }), true);
  assert.equal(isPlatformActivated({}, { estimatesTotal: 3 }), true);
});

test("shouldShowDashboardOnboarding inverts activation unless forced", () => {
  assert.equal(
    shouldShowDashboardOnboarding({ clients: { total: 5 } }),
    false,
  );
  assert.equal(shouldShowDashboardOnboarding(null), true);
});

test("NEXT_PUBLIC_DASHBOARD_FORCE_ONBOARDING=1 forces onboarding UI", () => {
  const previous = process.env.NEXT_PUBLIC_DASHBOARD_FORCE_ONBOARDING;
  process.env.NEXT_PUBLIC_DASHBOARD_FORCE_ONBOARDING = "1";
  try {
    assert.equal(shouldForceDashboardOnboarding(), true);
    assert.equal(
      shouldShowDashboardOnboarding({ clients: { total: 99 } }),
      true,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_DASHBOARD_FORCE_ONBOARDING;
    } else {
      process.env.NEXT_PUBLIC_DASHBOARD_FORCE_ONBOARDING = previous;
    }
  }
});
