/**
 * Determines whether a tenant has moved past first-run dashboard onboarding.
 * Used to hide informational / promotional cards in favor of operational metrics.
 *
 * @param {object|null|undefined} metrics — payload from /api/dashboard-metrics
 * @param {{ estimatesTotal?: number }} [options]
 * @returns {boolean}
 */
export function isPlatformActivated(metrics, { estimatesTotal = 0 } = {}) {
  if (!metrics) return false;

  return (
    Number(metrics?.clients?.total || 0) > 0 ||
    Number(metrics?.jobs?.total || 0) > 0 ||
    Number(metrics?.invoices?.total || 0) > 0 ||
    Number(estimatesTotal || 0) > 0
  );
}

/**
 * When true, always show onboarding UI (rollback / QA). Set NEXT_PUBLIC_DASHBOARD_FORCE_ONBOARDING=1
 */
export function shouldForceDashboardOnboarding() {
  return process.env.NEXT_PUBLIC_DASHBOARD_FORCE_ONBOARDING === "1";
}

export function shouldShowDashboardOnboarding(metrics, options = {}) {
  if (shouldForceDashboardOnboarding()) return true;
  return !isPlatformActivated(metrics, options);
}
