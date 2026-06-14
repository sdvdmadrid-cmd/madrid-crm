/**
 * Pure subscription access rules (Edge-safe — no server imports).
 */

export const SUBSCRIPTION_STATES = {
  SUPER_ADMIN: "super_admin",
  COMPLIMENTARY: "complimentary",
  ACTIVE: "active",
  TRIAL: "trial",
  STRIPE_TRIALING: "trialing",
  PAST_DUE: "past_due",
  CANCELLED: "cancelled",
  EXPIRED_TRIAL: "expired_trial",
};

const ACTIVE_STRIPE_STATUSES = new Set(["trialing", "active"]);
const RESTRICTED_STRIPE_STATUSES = new Set(["past_due", "unpaid", "canceled", "cancelled"]);

export function parseTrialEndMs(trialEndDate) {
  if (!trialEndDate) return null;
  const ms = new Date(trialEndDate).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isTrialActive(trialEndDate, nowMs = Date.now()) {
  const trialEndMs = parseTrialEndMs(trialEndDate);
  if (trialEndMs === null) return false;
  return nowMs <= trialEndMs;
}

/**
 * Resolve whether the tenant may use business features (CRM, jobs, payroll, etc.).
 */
export function resolveSubscriptionAccess(input = {}, nowMs = Date.now()) {
  const role = String(input.role || "").toLowerCase();
  const stripeStatus = String(input.stripeSubscriptionStatus || "")
    .trim()
    .toLowerCase();

  if (role === "super_admin") {
    return {
      state: SUBSCRIPTION_STATES.SUPER_ADMIN,
      hasBusinessAccess: true,
      isRestricted: false,
    };
  }

  if (input.complimentaryAccess === true) {
    return {
      state: SUBSCRIPTION_STATES.COMPLIMENTARY,
      hasBusinessAccess: true,
      isRestricted: false,
    };
  }

  if (RESTRICTED_STRIPE_STATUSES.has(stripeStatus)) {
    const state =
      stripeStatus === "past_due" || stripeStatus === "unpaid"
        ? SUBSCRIPTION_STATES.PAST_DUE
        : SUBSCRIPTION_STATES.CANCELLED;
    return {
      state,
      hasBusinessAccess: false,
      isRestricted: true,
    };
  }

  if (input.isSubscribed === true || ACTIVE_STRIPE_STATUSES.has(stripeStatus)) {
    return {
      state:
        stripeStatus === "trialing"
          ? SUBSCRIPTION_STATES.STRIPE_TRIALING
          : SUBSCRIPTION_STATES.ACTIVE,
      hasBusinessAccess: true,
      isRestricted: false,
    };
  }

  if (isTrialActive(input.trialEndDate, nowMs)) {
    return {
      state: SUBSCRIPTION_STATES.TRIAL,
      hasBusinessAccess: true,
      isRestricted: false,
    };
  }

  return {
    state: SUBSCRIPTION_STATES.EXPIRED_TRIAL,
    hasBusinessAccess: false,
    isRestricted: true,
  };
}

export const SUBSCRIPTION_ALLOWED_PAGE_PREFIXES = [
  "/subscribe",
  "/legal-required",
  "/legal",
];

export const SUBSCRIPTION_ALLOWED_API_PREFIXES = [
  "/api/subscriptions",
  "/api/auth",
  "/api/legal",
  "/api/company-profile",
  "/api/payments/connect",
  "/api/payments/webhooks",
  "/api/email/webhooks",
  "/api/health",
];

export function isSubscriptionBypassPath(pathname, apiPrefixes, pagePrefixes) {
  const path = String(pathname || "");
  if (!path) return false;

  const prefixes = path.startsWith("/api/") ? apiPrefixes : pagePrefixes;
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function subscriptionRequiredApiResponse() {
  return {
    status: 403,
    body: {
      success: false,
      error:
        "Your subscription is inactive. Subscribe to continue using FieldBase.",
      code: "SUBSCRIPTION_REQUIRED",
    },
    headers: {
      "Cache-Control": "private, no-store",
      "X-Subscription-Required": "true",
    },
  };
}
