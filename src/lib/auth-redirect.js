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

/** Auth entry routes — never valid post-login or login redirect targets. */
export const AUTH_ENTRY_PATHS = [
  "/login",
  "/register",
  "/sign-in",
  "/reset-password",
  "/verify-email",
];

/** Routes that cause redirect loops when used as redirect targets. */
const BLOCKED_REDIRECT_PATHS = ["/legal-required"];

const MAX_REDIRECT_UNWRAP_DEPTH = 5;

function tryDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isAuthEntryPath(pathname) {
  const path = String(pathname || "").split("?")[0].split("#")[0];
  return AUTH_ENTRY_PATHS.some(
    (entry) => path === entry || path.startsWith(`${entry}/`),
  );
}

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

/** Unwrap nested redirect/next query params (e.g. /login?redirect=/dashboard). */
export function unwrapRedirectParam(raw, depth = 0) {
  if (depth >= MAX_REDIRECT_UNWRAP_DEPTH) return "";

  let value = String(raw || "").trim();
  if (!value) return "";

  for (let i = 0; i < 3; i += 1) {
    const decoded = tryDecodeURIComponent(value);
    if (decoded === value) break;
    value = decoded;
  }

  if (!value.startsWith("/") || value.startsWith("//")) return "";

  let pathname = value;
  let search = "";
  const qIndex = value.indexOf("?");
  if (qIndex >= 0) {
    pathname = value.slice(0, qIndex);
    search = value.slice(qIndex);
  }

  if (!isAuthEntryPath(pathname)) {
    return pathname + search;
  }

  const params = new URLSearchParams(search.replace(/^\?/, ""));
  const inner =
    params.get("redirect") ||
    params.get("next") ||
    params.get("return_to") ||
    "";
  if (inner) {
    const unwrapped = unwrapRedirectParam(inner, depth + 1);
    if (unwrapped) return unwrapped;
  }

  return "";
}

/**
 * Sanitize an internal redirect path for safe navigation.
 * Returns empty string when invalid — callers should use role default.
 */
export function sanitizeRedirectPath(raw, { role = "", currentPath = "" } = {}) {
  const unwrapped = unwrapRedirectParam(raw);
  if (!unwrapped) return "";

  const pathname = unwrapped.split("?")[0].split("#")[0];

  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "";
  if (isAuthEntryPath(pathname)) return "";
  if (BLOCKED_REDIRECT_PATHS.includes(pathname)) return "";
  if (pathname.startsWith("/auth/")) return "";

  const normalizedRole = String(role || "").toLowerCase();
  if (isOwnerCommandCenterPath(pathname) && normalizedRole !== "super_admin") {
    return "";
  }

  const current = String(currentPath || "").split("?")[0];
  if (current && pathname === current) return "";

  return unwrapped;
}

export function parseRedirectParam(searchParams) {
  if (!searchParams) return "";
  const get = (key) => {
    if (typeof searchParams.get === "function") {
      return searchParams.get(key) || "";
    }
    return "";
  };
  return get("redirect") || get("next") || get("return_to") || "";
}

export function buildLoginRedirectPath(
  intendedPath = "",
  { currentPath = "", role = "" } = {},
) {
  const safe = sanitizeRedirectPath(intendedPath, { currentPath, role });
  if (!safe) {
    return "/login";
  }
  return `/login?redirect=${encodeURIComponent(safe)}`;
}

export function resolvePostLoginPath(user, redirectParam = "", options = {}) {
  const role = String(user?.role || "").toLowerCase();
  if (
    user?.hasBusinessAccess === false &&
    role !== "super_admin" &&
    !user?.complimentaryAccess
  ) {
    if (typeof console !== "undefined") {
      console.log("Trial expired:", user?.userId || "unknown");
      console.log("Subscription active:", user?.isSubscribed === true);
      console.log("Redirecting to /subscribe");
    }
    return "/subscribe";
  }

  const sanitized = sanitizeRedirectPath(redirectParam, {
    role,
    currentPath: options.currentPath || "",
  });

  if (sanitized) {
    return sanitized;
  }

  if (role === "super_admin") {
    return "/owner/overview";
  }
  return "/dashboard";
}
