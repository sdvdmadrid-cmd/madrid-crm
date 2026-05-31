import {
  buildIndustryWebsiteDefaults,
  getWebsiteBuilderPack,
  textViolatesIndustryPack,
} from "@/lib/website-builder-industry";
import { getCompanyDisplayName } from "@/lib/website-builder-company";
import { buildLandscapingDefaultServices } from "@/lib/landscaping-services-catalog";
import {
  filterHomeownerFacingServices,
  normalizeContractorServices,
  scrubHomeownerFacingCopy,
} from "@/lib/website-lead-form";

const REMODELING_RE =
  /\b(remodel(ing)?|renovation|construction(\s*&\s*remodeling)?|general\s+contractor|kitchen\s+bath|home\s+addition|build[- ]?out)\b/i;

/** Featured services for public landscaping sites (no pricing — custom estimates only). */
export const LANDSCAPING_DEFAULT_SERVICES = buildLandscapingDefaultServices().slice(0, 12);

export const LANDSCAPING_TRUST_BADGES = [
  "Licensed & Insured",
  "Free Estimates",
  "Satisfaction Guaranteed",
];

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function containsRemodelingCopy(text) {
  return REMODELING_RE.test(String(text || ""));
}

export function scrubRemodelingCopy(text) {
  const value = String(text || "").trim();
  if (!value || !containsRemodelingCopy(value)) return value;
  return "";
}

export function headlineMatchesCompanyName(headline, companyName) {
  const h = normalizeKey(headline);
  const c = normalizeKey(companyName);
  if (!h || !c) return false;
  return h === c || h.includes(c) || c.includes(h);
}

export function resolveMarketingHeadline(headline, companyName, fallback) {
  const raw = scrubHomeownerFacingCopy(String(headline || "").trim());
  const fb = String(fallback || "").trim();
  if (!raw || headlineMatchesCompanyName(raw, companyName) || containsRemodelingCopy(raw)) {
    return fb;
  }
  return raw;
}

/** Only testimonials explicitly marked verified (imported sources). Never use pack samples. */
export function sanitizeWebsiteTestimonials(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((t) => {
      if (!t || typeof t !== "object") return false;
      if (t.verified === true) return true;
      const platform = String(t.platform || t.source || "").trim().toLowerCase();
      return Boolean(platform && platform !== "manual" && platform !== "sample");
    })
    .map((t) => ({
      quote: scrubHomeownerFacingCopy(String(t.quote || "").slice(0, 280)),
      name: String(t.name || t.authorName || "").slice(0, 60),
      role: String(t.role || "").slice(0, 80),
      verified: true,
      platform: String(t.platform || t.source || "").trim(),
    }))
    .filter((t) => t.quote && t.name);
}

export function normalizeWebsiteTrustBadges(badges, pack) {
  const list = (Array.isArray(badges) ? badges : [])
    .map((b) =>
      scrubHomeownerFacingCopy(
        scrubRemodelingCopy(String(b || "").trim()),
      ),
    )
    .filter(Boolean)
    .filter((b) => !textViolatesIndustryPack(b, pack.key))
    .slice(0, 6);

  if (list.length >= 2) return list;

  const defaults =
    pack.key === "landscaping_hardscaping"
      ? LANDSCAPING_TRUST_BADGES
      : (buildIndustryWebsiteDefaults(pack).trustBadges || LANDSCAPING_TRUST_BADGES);

  return [...defaults];
}

export function resolveWebsiteServices(services, catalogServices, pack) {
  const catalog = filterHomeownerFacingServices(catalogServices);
  let list = filterHomeownerFacingServices(services);

  list = list.filter(
    (s) =>
      !containsRemodelingCopy(`${s.name} ${s.description}`) &&
      !textViolatesIndustryPack(`${s.name} ${s.description}`, pack.key),
  );

  if (catalog.length > 0) {
    return catalog.slice(0, 12);
  }

  if (list.length > 0) {
    return list;
  }

  if (pack.key === "landscaping_hardscaping") {
    return LANDSCAPING_DEFAULT_SERVICES.map((s) => ({ ...s }));
  }

  return buildIndustryWebsiteDefaults(pack).services.map((s) => ({ ...s }));
}

export function scrubWebsiteTextField(text, pack, fallback = "") {
  const cleaned = scrubHomeownerFacingCopy(scrubRemodelingCopy(String(text || "").trim()));
  if (!cleaned || textViolatesIndustryPack(cleaned, pack.key)) {
    return String(fallback || "").trim();
  }
  return cleaned;
}

export function purifyWebsiteForm(form = {}, companyProfile = {}, industryKey, catalogServices = []) {
  const pack = getWebsiteBuilderPack(industryKey);
  const defaults = buildIndustryWebsiteDefaults(pack, companyProfile);
  const companyName = getCompanyDisplayName(companyProfile);

  const headline = resolveMarketingHeadline(
    form.headline,
    companyName,
    defaults.headline,
  );
  const subheadline = scrubWebsiteTextField(
    form.subheadline,
    pack,
    defaults.subheadline,
  );
  const aboutText = scrubWebsiteTextField(form.aboutText, pack, defaults.aboutText);
  const ctaText = scrubWebsiteTextField(form.ctaText, pack, defaults.ctaText);

  return {
    ...form,
    headline,
    subheadline,
    aboutText,
    ctaText: ctaText || defaults.ctaText,
    themeColor: form.themeColor || defaults.themeColor,
    services: resolveWebsiteServices(form.services, catalogServices, pack),
    testimonials: sanitizeWebsiteTestimonials(form.testimonials),
    trustBadges: normalizeWebsiteTrustBadges(form.trustBadges, pack),
  };
}
