/**
 * Canonical public website URL paths (multi-tenant, one slug per company).
 * Builder UI stays at /website; published sites live under /sites/{slug}.
 */

export const PUBLIC_SITES_PREFIX = "/sites";
export const LEGACY_SITE_PREFIX = "/site";

const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "admin",
  "owner",
  "login",
  "register",
  "website",
  "website-builder",
  "dashboard",
  "settings",
  "sites",
  "site",
  "company",
  "public",
  "app",
  "static",
  "_next",
]);

export function normalizeWebsiteSlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Decode route param / link segment then normalize for DB lookup. */
export function parsePublicWebsiteSlug(raw) {
  let value = String(raw || "").trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep raw */
  }
  return normalizeWebsiteSlug(value);
}

export function isReservedWebsiteSlug(slug) {
  const normalized = normalizeWebsiteSlug(slug);
  if (!normalized || normalized.length < 2) return true;
  return RESERVED_SLUGS.has(normalized);
}

export function buildPublicWebsitePath(slug, subpath = "") {
  const normalized = normalizeWebsiteSlug(slug);
  if (!normalized) return PUBLIC_SITES_PREFIX;
  const suffix = String(subpath || "").replace(/^\//, "");
  return suffix
    ? `${PUBLIC_SITES_PREFIX}/${normalized}/${suffix}`
    : `${PUBLIC_SITES_PREFIX}/${normalized}`;
}

export function buildPublicWebsiteRequestPath(slug) {
  return buildPublicWebsitePath(slug, "request");
}

/**
 * Absolute public URL: subdomain when NEXT_PUBLIC_SITE_DOMAIN is set, else path on app origin.
 */
export function buildPublicWebsiteUrl(slug, requestOrOrigin) {
  const normalized = normalizeWebsiteSlug(slug);
  if (!normalized) return "";

  const domain = String(process.env.NEXT_PUBLIC_SITE_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  if (domain) {
    return `https://${normalized}.${domain}`;
  }

  const origin =
    typeof requestOrOrigin === "string"
      ? requestOrOrigin.replace(/\/$/, "")
      : requestOrOrigin?.url
        ? new URL(requestOrOrigin.url).origin
        : "";

  if (!origin) return buildPublicWebsitePath(normalized);
  return `${origin}${buildPublicWebsitePath(normalized)}`;
}

export function buildPublicWebsiteRequestUrl(slug, requestOrOrigin) {
  const normalized = normalizeWebsiteSlug(slug);
  if (!normalized) return "";

  const domain = String(process.env.NEXT_PUBLIC_SITE_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  if (domain) {
    return `https://${normalized}.${domain}/request`;
  }

  const origin =
    typeof requestOrOrigin === "string"
      ? requestOrOrigin.replace(/\/$/, "")
      : requestOrOrigin?.url
        ? new URL(requestOrOrigin.url).origin
        : "";

  if (!origin) return buildPublicWebsiteRequestPath(normalized);
  return `${origin}${buildPublicWebsiteRequestPath(normalized)}`;
}

export function revalidatePublicWebsitePaths(slug, revalidatePath) {
  const normalized = normalizeWebsiteSlug(slug);
  if (!normalized || typeof revalidatePath !== "function") return;
  revalidatePath(buildPublicWebsitePath(normalized));
  revalidatePath(buildPublicWebsiteRequestPath(normalized));
  revalidatePath(`${LEGACY_SITE_PREFIX}/${normalized}`);
  revalidatePath(`${LEGACY_SITE_PREFIX}/${normalized}/request`);
}
