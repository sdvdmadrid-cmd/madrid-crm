/**
 * Tenant CRM routes that use the premium dark workspace shell.
 */

const PREMIUM_WORKSPACE_PREFIXES = [
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
  "/website-builder",
  "/website",
  "/services-catalog",
  "/payment-methods",
];

export function isPremiumWorkspacePath(pathname) {
  const path = String(pathname || "").split("?")[0].split("#")[0];
  if (!path || path === "/") return false;
  return PREMIUM_WORKSPACE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
