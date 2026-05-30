/**
 * FieldBase platform zones — PUBLIC contractor websites vs PRIVATE contractor dashboard.
 *
 * PUBLIC: Homeowner-facing published sites only. No CRM, leads detail, invoices, or internal data.
 * PRIVATE: Authenticated tenant workspace. Never exposed without session + tenant scope.
 */

export const PLATFORM_ZONE = {
  PUBLIC_WEBSITE: "public_website",
  PRIVATE_DASHBOARD: "private_dashboard",
};

/** Routes homeowners may access (no FieldBase login). */
export const PUBLIC_WEBSITE_PAGE_PREFIXES = [
  "/site",
  "/sites",
  "/quote",
  "/estimate",
  "/public",
];

/** API routes callable without tenant session (strict allowlist). */
export const PUBLIC_WEBSITE_API_PREFIXES = [
  "/api/site/",
  "/api/public/",
  "/api/health",
  "/api/auth/",
  "/api/payments/webhooks",
  "/api/email/webhooks",
  "/api/email/inbound",
  "/api/inngest/",
];

/** Private CRM / operations — middleware + route handlers must require auth. */
export const PRIVATE_DASHBOARD_PAGE_PREFIXES = [
  "/dashboard",
  "/clients",
  "/jobs",
  "/invoices",
  "/estimates",
  "/estimate-builder",
  "/smart-estimator",
  "/calendar",
  "/lead-inbox",
  "/subscriptions",
  "/settings",
  "/website",
  "/website-builder",
  "/services-catalog",
  "/reputation",
  "/payment-methods",
  "/contracts",
  "/bill-payments",
];

/** Private APIs — never return cross-tenant data; use getAuthenticatedTenantContext. */
export const PRIVATE_DASHBOARD_API_PREFIXES = [
  "/api/clients",
  "/api/jobs",
  "/api/invoices",
  "/api/estimates",
  "/api/lead-inbox",
  "/api/website-builder",
  "/api/reputation",
  "/api/company-profile",
  "/api/services-catalog",
  "/api/dashboard-metrics",
  "/api/notifications",
  "/api/appointments",
  "/api/places",
  "/api/contracts",
  "/api/email/campaigns",
];

export function normalizePathname(pathname) {
  return String(pathname || "").split("?")[0].split("#")[0];
}

export function isPublicWebsitePath(pathname) {
  const path = normalizePathname(pathname);
  if (path === "/") return true;
  return PUBLIC_WEBSITE_PAGE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isPublicWebsiteApiPath(pathname) {
  const path = normalizePathname(pathname);
  return PUBLIC_WEBSITE_API_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isPrivateDashboardPath(pathname) {
  const path = normalizePathname(pathname);
  return PRIVATE_DASHBOARD_PAGE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isPrivateDashboardApiPath(pathname) {
  const path = normalizePathname(pathname);
  return PRIVATE_DASHBOARD_API_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function zoneResponseHeaders(zone) {
  return {
    "X-Fieldbase-Zone": zone,
    "Cache-Control":
      zone === PLATFORM_ZONE.PUBLIC_WEBSITE
        ? "public, s-maxage=120, stale-while-revalidate=300"
        : "private, no-store",
  };
}
