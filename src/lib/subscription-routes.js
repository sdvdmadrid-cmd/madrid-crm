/** Subscription routing constants shared by middleware, AuthShell, and auth redirects. */

export const EXPIRED_TRIAL_SUBSCRIBE_PATH = "/subscribe";

export const SUBSCRIPTION_EXEMPT_PAGE_PREFIXES = [
  EXPIRED_TRIAL_SUBSCRIBE_PATH,
  "/legal-required",
  "/legal",
];

export function isSubscriptionExemptPage(pathname) {
  const path = String(pathname || "").split("?")[0].split("#")[0];
  return SUBSCRIPTION_EXEMPT_PAGE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function logExpiredTrialRedirect(user, subscriptionActive = false) {
  if (typeof console === "undefined") return;
  console.log("Trial expired:", user?.userId || user?.id || "unknown");
  console.log("Subscription active:", subscriptionActive);
  console.log("Redirecting to /subscribe");
}

export function shouldRestrictForSubscription(user) {
  if (!user) return false;
  if (user.complimentaryAccess) return false;
  if (String(user.role || "").toLowerCase() === "super_admin") return false;
  return user.hasBusinessAccess === false;
}

export function resolvePostAuthDestination(user, redirectParam = "", options = {}) {
  if (shouldRestrictForSubscription(user)) {
    logExpiredTrialRedirect(user, user?.isSubscribed === true);
    return EXPIRED_TRIAL_SUBSCRIBE_PATH;
  }
  // Defer to auth-redirect for active users (imported at call sites to avoid cycles)
  return null;
}
