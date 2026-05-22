/**
 * Per-tenant public website analytics configuration (stored in site_meta.analytics).
 */

const ID_PATTERNS = {
  ga4MeasurementId: /^G-[A-Z0-9]{6,}$/i,
  plausibleDomain: /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i,
  metaPixelId: /^\d{8,20}$/,
  gtmContainerId: /^GTM-[A-Z0-9]{4,}$/i,
};

export function normalizeSiteAnalytics(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [key, pattern] of Object.entries(ID_PATTERNS)) {
    const value = String(source[key] || "").trim();
    if (!value) continue;
    if (pattern.test(value)) {
      out[key] = value;
    }
  }
  return out;
}

export function hasSiteAnalytics(analytics) {
  return Object.keys(normalizeSiteAnalytics(analytics)).length > 0;
}
