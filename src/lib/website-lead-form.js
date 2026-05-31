/**
 * Website lead form — shared validation and service resolution.
 */

import {
  getRequestServiceOptionsForIndustry,
  isLandscapingIndustryKey,
  LANDSCAPING_INDUSTRY_KEY,
} from "./landscaping-services-catalog.js";

export const LEAD_SERVICE_OTHER = "Other";

const BUSINESS_TYPE_LANDSCAPING_RE =
  /\b(landscap|lawn\s*care|hardscap|lawn\s*service|outdoor\s*living)\b/i;

const PUBLIC_PRICE_RE =
  /^(from\s*\$|custom\s+quote|free\s+consult|request\s+quote|free\s+estimate|contact\s+us)/i;

export const LEAD_BUDGET_OPTIONS = [
  { id: "under-1k", label: "Under $1,000" },
  { id: "1k-5k", label: "$1,000 – $5,000" },
  { id: "5k-15k", label: "$5,000 – $15,000" },
  { id: "15k-50k", label: "$15,000 – $50,000" },
  { id: "50k-plus", label: "$50,000+" },
  { id: "not-sure", label: "Not sure yet" },
];

export const LEAD_TIMELINE_OPTIONS = [
  { id: "asap", label: "As soon as possible" },
  { id: "1-2-weeks", label: "Within 1–2 weeks" },
  { id: "1-month", label: "Within a month" },
  { id: "flexible", label: "Flexible / planning ahead" },
  { id: "not-sure", label: "Not sure yet" },
];

export const LEAD_CONTACT_PREFERENCES = [
  { id: "phone", label: "Phone call" },
  { id: "text", label: "Text message" },
  { id: "email", label: "Email" },
];

export const LEAD_STATUSES = ["new", "contacted", "completed", "converted", "archived"];

const HOMEOWNER_BANNED_COPY = [
  /ai[- ]?powered/i,
  /ai\s+estimates?/i,
  /automated\s+scheduling/i,
  /scheduling\s+assistant/i,
  /powered\s+by\s+ai/i,
  /\bestimates?\s*(?:&|and)\s*scheduling\b/i,
  /smart\s+estimator/i,
  /fieldbase/i,
];

export function scrubHomeownerFacingCopy(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (HOMEOWNER_BANNED_COPY.some((re) => re.test(value))) return "";
  return value;
}

export function isHomeownerFacingService(service) {
  const name = scrubHomeownerFacingCopy(String(service?.name || "").trim());
  return Boolean(name);
}

export function stripPublicServicePrice(price) {
  const value = String(price || "").trim();
  if (!value) return "";
  if (PUBLIC_PRICE_RE.test(value) || /\$\d/.test(value) || /\/visit/i.test(value)) {
    return "";
  }
  return "";
}

export function normalizeContractorServices(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((s) => ({
      name: scrubHomeownerFacingCopy(String(s?.name || "").trim()),
      description: scrubHomeownerFacingCopy(String(s?.description || "").trim()).slice(0, 400),
      price: stripPublicServicePrice(s?.price),
    }))
    .filter((s) => s.name)
    .slice(0, 24);
}

/** Drop platform/AI offerings — only real customer-facing trade services on public sites. */
export function filterHomeownerFacingServices(list = []) {
  return normalizeContractorServices(list)
    .filter((s) => isHomeownerFacingService(s))
    .map(({ name, description }) => ({ name, description }));
}

export function mergeAiServicesWithContractorCatalog(aiServices = [], contractorServices = []) {
  const catalog = normalizeContractorServices(contractorServices);
  if (!catalog.length) return normalizeContractorServices(aiServices);
  const ai = normalizeContractorServices(aiServices);
  return catalog.map((c) => {
    const match = ai.find((a) => a.name.toLowerCase() === c.name.toLowerCase());
    return {
      name: c.name,
      description: (match?.description || c.description || "").slice(0, 400),
      price: stripPublicServicePrice(match?.price || c.price || ""),
    };
  });
}

function ensureOtherServiceOption(list = []) {
  const options = [...list];
  if (!options.some((s) => s.toLowerCase() === LEAD_SERVICE_OTHER.toLowerCase())) {
    options.push(LEAD_SERVICE_OTHER);
  }
  return options;
}

function resolveRequestIndustryKey(website = {}) {
  let industryKey = String(website.industryKey || website.industry || "").trim();
  const businessType = String(
    website.businessType ||
      website.companyProfile?.business_type ||
      website.companyProfile?.businessType ||
      "",
  ).trim();
  if (
    businessType &&
    BUSINESS_TYPE_LANDSCAPING_RE.test(businessType) &&
    (!industryKey || industryKey === "general")
  ) {
    industryKey = LANDSCAPING_INDUSTRY_KEY;
  }
  if (isLandscapingIndustryKey(industryKey)) {
    industryKey = LANDSCAPING_INDUSTRY_KEY;
  }
  return industryKey;
}

export function resolveWebsiteRequestServices(website = {}) {
  const industryKey = resolveRequestIndustryKey(website);
  const industryCatalog = getRequestServiceOptionsForIndustry(industryKey);
  if (industryCatalog?.length) {
    return ensureOtherServiceOption(industryCatalog);
  }

  const fromServices = Array.isArray(website.services)
    ? website.services
        .map((s) => String(s?.name || "").trim())
        .filter(Boolean)
    : [];
  if (fromServices.length) {
    return ensureOtherServiceOption([...new Set(fromServices)].slice(0, 48));
  }

  const fromPack = Array.isArray(website.requestServices)
    ? website.requestServices.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  return ensureOtherServiceOption([...new Set(fromPack)].slice(0, 48));
}

/** Map "Other" + custom text to the value stored on the lead. */
export function resolveLeadServiceNeeded(serviceNeeded, serviceOther = "") {
  const selected = String(serviceNeeded || "").trim();
  const custom = String(serviceOther || "").trim();
  if (selected.toLowerCase() === LEAD_SERVICE_OTHER.toLowerCase()) {
    return custom.slice(0, 160);
  }
  return selected.slice(0, 160);
}

export function isAllowedRequestService(serviceNeeded, allowedList = []) {
  const value = String(serviceNeeded || "").trim();
  if (!value) return false;
  if (!allowedList.length) return true;
  if (allowedList.some((s) => s.toLowerCase() === value.toLowerCase())) {
    return true;
  }
  const allowsOther = allowedList.some(
    (s) => s.toLowerCase() === LEAD_SERVICE_OTHER.toLowerCase(),
  );
  return allowsOther && value.length >= 2;
}

export function normalizeLeadPayload(body = {}) {
  return {
    name: String(body.name || "").trim().slice(0, 200),
    email: String(body.email || "").trim().slice(0, 200),
    phone: String(body.phone || "").trim().slice(0, 20),
    addressLine1: String(body.addressLine1 || body.address || "").trim().slice(0, 300),
    city: String(body.city || "").trim().slice(0, 120),
    state: String(body.state || "").trim().slice(0, 40),
    zipCode: String(body.zipCode || "").trim().slice(0, 20),
    serviceNeeded: String(body.serviceNeeded || "").trim().slice(0, 160),
    serviceOther: String(body.serviceOther || "").trim().slice(0, 160),
    description: String(body.description || "").trim().slice(0, 2000),
    budgetRange: String(body.budgetRange || "").trim().slice(0, 40),
    timeline: String(body.timeline || "").trim().slice(0, 40),
    contactPreference: String(body.contactPreference || "phone").trim().slice(0, 20),
    photoDataUrl: String(body.photoDataUrl || "").trim(),
    submissionId: String(body.submissionId || "").trim().slice(0, 64),
    website: String(body.website || "").trim().slice(0, 200),
    formStartedAt: body.formStartedAt,
    turnstileToken: body.turnstileToken,
  };
}

export function buildFullAddress(parts) {
  const line1 = String(parts.addressLine1 || "").trim();
  const cityStateZip = [parts.city, parts.state, parts.zipCode].filter(Boolean).join(" ");
  return [line1, cityStateZip].filter(Boolean).join(", ");
}

export function labelForBudget(id, locale = "en") {
  const match = LEAD_BUDGET_OPTIONS.find((o) => o.id === id);
  return match?.label || id || "";
}

export function labelForTimeline(id) {
  const match = LEAD_TIMELINE_OPTIONS.find((o) => o.id === id);
  return match?.label || id || "";
}
