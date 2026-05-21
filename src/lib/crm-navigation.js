/**
 * CRM route labels and breadcrumb/back helpers (shared by AuthShell).
 */

const TENANT_SECTIONS = {
  dashboard: { href: "/dashboard", labelKey: "sidebar.dashboard" },
  clients: { href: "/clients", labelKey: "sidebar.clients" },
  jobs: { href: "/jobs", labelKey: "sidebar.jobs" },
  invoices: { href: "/invoices", labelKey: "sidebar.invoices" },
  estimates: { href: "/estimates", labelKey: "sidebar.estimates" },
  "estimate-builder": {
    href: "/estimate-builder",
    labelKey: "sidebar.estimates",
  },
  "lead-inbox": { href: "/lead-inbox", labelKey: "sidebar.leadInbox" },
  calendar: { href: "/calendar", labelKey: "sidebar.calendar" },
  subscriptions: {
    href: "/subscriptions",
    labelKey: "sidebar.subscriptions",
  },
  website: { href: "/website", labelKey: "sidebar.websiteBuilder" },
  "services-catalog": {
    href: "/services-catalog",
    labelKey: "sidebar.services",
  },
};

const OWNER_SECTIONS = {
  owner: { href: "/owner/overview", labelKey: "sidebar.platform" },
  overview: { href: "/owner/overview", labelKey: "sidebar.adminOverview" },
  tenants: { href: "/owner/tenants", labelKey: "nav.ownerTenants" },
  revenue: { href: "/owner/revenue", labelKey: "sidebar.adminStripe" },
  "ai-ops": { href: "/owner/ai-ops", labelKey: "sidebar.adminAi" },
  activity: { href: "/owner/activity", labelKey: "nav.ownerActivity" },
  support: { href: "/owner/support", labelKey: "sidebar.adminSupport" },
  security: { href: "/owner/security", labelKey: "sidebar.adminSecurity" },
  emails: { href: "/owner/emails", labelKey: "nav.ownerEmails" },
  "feature-flags": {
    href: "/owner/feature-flags",
    labelKey: "nav.ownerFeatureFlags",
  },
  monitoring: { href: "/owner/monitoring", labelKey: "nav.ownerMonitoring" },
  "payment-cards": {
    href: "/owner/payment-cards",
    labelKey: "ownerNav.paymentCards",
  },
  settings: { href: "/owner/settings", labelKey: "sidebar.adminSettings" },
};

const ROOT_BACK_DISABLED = new Set([
  "/",
  "/dashboard",
  "/owner/overview",
  "/owner",
  "/login",
  "/reset-password",
  "/verify-email",
]);

export function shouldShowCrmNav(pathname) {
  const path = String(pathname || "").split("?")[0];
  if (ROOT_BACK_DISABLED.has(path)) {
    return false;
  }
  const section = path.split("/").filter(Boolean)[0] || "";
  return Boolean(TENANT_SECTIONS[section] || section === "owner");
}

export function getBackFallbackPath(pathname) {
  const currentPath = String(pathname || "").split("?")[0];
  const segments = currentPath.split("/").filter(Boolean);

  if (segments.length <= 1) {
    return segments[0] === "owner" ? "/owner/overview" : "/dashboard";
  }

  const section = segments[0];
  if (section === "owner") {
    return "/owner/overview";
  }

  if (section === "admin") {
    return "/owner/overview";
  }

  return `/${section}`;
}

/**
 * @returns {{ href: string, labelKey: string }[]}
 */
export function getCrmBreadcrumbs(pathname) {
  const path = String(pathname || "").split("?")[0];
  const segments = path.split("/").filter(Boolean);
  if (!segments.length) {
    return [];
  }

  const crumbs = [];

  if (segments[0] === "owner") {
    crumbs.push(OWNER_SECTIONS.owner);
    for (let i = 1; i < segments.length; i += 1) {
      const key = segments[i];
      const meta = OWNER_SECTIONS[key];
      if (meta) {
        crumbs.push(meta);
      }
    }
    return crumbs;
  }

  const root = TENANT_SECTIONS[segments[0]];
  if (root) {
    crumbs.push(root);
  }

  if (segments.length > 1 && segments[0] !== "dashboard") {
    crumbs.push({
      href: path,
      labelKey: "nav.currentPage",
    });
  }

  return crumbs;
}
