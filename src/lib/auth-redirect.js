/** Routes that belong to tenant contractors — not platform Mission Control. */
const TENANT_CONTRACTOR_PREFIXES = [
  "/dashboard",
  "/clients",
  "/jobs",
  "/invoices",
  "/estimates",
  "/estimates/new",
  "/smart-estimator",
  "/calendar",
  "/lead-inbox",
  "/subscriptions",
  "/website-builder",
  "/website",
  "/services-catalog",
  "/bill-payments",
  "/payment-methods",
  "/workspace-owner",
];

export function isOwnerCommandCenterPath(pathname) {
  const path = String(pathname || "").split("?")[0].split("#")[0];
  return path === "/owner" || path.startsWith("/owner/");
}

export function isTenantContractorAppPath(pathname) {
  const path = String(pathname || "").split("?")[0].split("#")[0];
  if (!path || path === "/" || isOwnerCommandCenterPath(path)) {
    return false;
  }
  return TENANT_CONTRACTOR_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function resolvePostLoginPath(user, redirectParam = "") {
  const redirect = String(redirectParam || "").trim();
  if (redirect.startsWith("/")) {
    return redirect;
  }
  if (String(user?.role || "").toLowerCase() === "super_admin") {
    return "/owner/overview";
  }
  return "/dashboard";
}
