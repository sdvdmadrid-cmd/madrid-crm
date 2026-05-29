import { STANDARD_CSV_HEADER_ALIASES } from "./standard-csv-aliases.js";

export const IMPORT_PROVIDERS = [
  {
    id: "generic",
    label: "Any CRM or spreadsheet",
    description:
      "Export a client list as CSV from your current app, then map columns here.",
  },
];

/** @type {Record<string, string[]>} */
const SMART_HEADER_ALIASES = {
  name: [
    "name",
    "full name",
    "client name",
    "customer name",
    "display name",
    "contact name",
    "client",
    "customer",
  ],
  firstName: ["first name", "firstname", "given name", "fname"],
  lastName: ["last name", "lastname", "surname", "family name", "lname"],
  email: [
    "email",
    "email address",
    "e-mail",
    "primary email",
    "contact email",
    "client email",
    "main email",
    "billing email",
    "invoice email",
  ],
  phone: [
    "phone",
    "phone number",
    "primary phone",
    "contact phone",
    "client phone",
    "main phone",
    "telephone",
  ],
  mobilePhone: ["mobile", "mobile phone", "cell", "cell phone"],
  homePhone: ["home phone", "home"],
  workPhone: ["work phone", "office phone", "business phone"],
  address: [
    "address",
    "street",
    "street address",
    "service address",
    "property address",
    "service street",
    "property street",
    "primary address",
    "mailing address",
    "address 1",
    "address line 1",
    "street 1",
    "service street 1",
    "service street",
    "property street 1",
  ],
  addressLine2: [
    "address 2",
    "address line 2",
    "street 2",
    "service street 2",
    "property street 2",
    "unit",
    "suite",
    "apt",
    "apartment",
  ],
  city: [
    "city",
    "service city",
    "property city",
    "billing city",
    "town",
    "municipality",
  ],
  state: [
    "state",
    "province",
    "region",
    "service state",
    "billing state",
    "state/province",
  ],
  zip: [
    "zip",
    "zip code",
    "postal code",
    "postal",
    "service zip",
    "billing zip",
    "postcode",
  ],
  company: [
    "company",
    "company name",
    "business name",
    "organization",
    "org",
  ],
  billingAddress: [
    "billing address",
    "billing street",
    "bill to address",
  ],
  billingCity: ["billing city", "bill to city"],
  billingState: ["billing state", "bill to state"],
  billingZip: ["billing zip", "billing postal", "bill to zip"],
  notes: [
    "notes",
    "note",
    "client notes",
    "customer notes",
    "tags",
    "description",
    "internal notes",
  ],
  leadStatus: ["lead status", "pipeline status", "client status"],
};

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function mergeAliasLists(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const item of list || []) {
      const key = normalizeHeaderKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * All known header aliases for a field (generic + common CRM export shapes).
 * @param {string} fieldKey
 */
export function getImportFieldAliases(fieldKey) {
  return mergeAliasLists(
    SMART_HEADER_ALIASES[fieldKey],
    STANDARD_CSV_HEADER_ALIASES[fieldKey],
  );
}

const STANDARD_CSV_SIGNALS = [
  "first name",
  "last name",
  "street 1",
  "mobile phone",
  "billing street 1",
  "client id",
];

/**
 * Detect common split-name / street-1 CRM export layouts for smarter auto-mapping.
 * @param {string[]} headers
 * @returns {"standard" | "generic"}
 */
export function detectImportFormat(headers = []) {
  const keys = headers.map((h) => normalizeHeaderKey(h));
  const hits = STANDARD_CSV_SIGNALS.filter((signal) => keys.includes(signal));
  if (hits.length >= 2) return "standard";
  return "generic";
}

/** @deprecated Use detectImportFormat */
export function detectImportProvider(headers) {
  const format = detectImportFormat(headers);
  return format === "standard" ? "standard" : "generic";
}

function isBillingHeader(headerKey = "") {
  return (
    headerKey.includes("billing") ||
    headerKey.includes("bill to") ||
    headerKey.startsWith("bill ")
  );
}

function isServiceHeader(headerKey = "") {
  return (
    headerKey.includes("service") ||
    headerKey.includes("property") ||
    headerKey.includes("job site") ||
    headerKey.includes("jobsite")
  );
}

function scoreHeaderForField(fieldKey, patternKey, headerKey, { exact }) {
  let score = exact ? 1000 : 400;
  score += Math.min(patternKey.length * 3, 60);

  const billing = isBillingHeader(headerKey);
  const service = isServiceHeader(headerKey);

  if (fieldKey.startsWith("billing")) {
    if (!billing) score -= 200;
    if (service) score -= 80;
  } else {
    if (billing) score -= 250;
    if (service) score += 40;
  }

  if (fieldKey === "address") {
    if (headerKey === "address") score += 200;
    if (headerKey === "street 1" || headerKey === "service street 1") score += 180;
    if (service && headerKey.includes("street")) score += 120;
    if (headerKey.includes("street 1") && !billing) score += 100;
    if (billing && headerKey.includes("street")) score -= 150;
  }

  if (fieldKey === "addressLine2") {
    if (headerKey === "street 2" || headerKey === "service street 2") score += 120;
    if (billing) score -= 120;
  }

  if (fieldKey === "city" && headerKey === "service city") score += 80;
  if (fieldKey === "city" && billing) score -= 100;
  if (fieldKey === "state" && headerKey === "service state") score += 80;
  if (fieldKey === "state" && billing) score -= 100;
  if (fieldKey === "zip" && headerKey.includes("service")) score += 60;
  if (fieldKey === "zip" && billing) score -= 100;

  if (fieldKey === "email" && billing) score -= 60;
  if (fieldKey === "phone" && billing) score -= 40;

  return score;
}

/**
 * Suggest a column mapping from CSV headers.
 * @param {string[]} headers
 * @param {string} [_formatId]
 * @returns {Record<string, string>}
 */
export function suggestColumnMapping(headers, _formatId) {
  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    key: normalizeHeaderKey(h),
  }));

  /** @type {Record<string, string>} */
  const mapping = {};
  const used = new Set();

  const FIELD_ORDER = [
    "firstName",
    "lastName",
    "name",
    "email",
    "phone",
    "mobilePhone",
    "homePhone",
    "workPhone",
    "address",
    "addressLine2",
    "city",
    "state",
    "zip",
    "company",
    "billingAddress",
    "billingCity",
    "billingState",
    "billingZip",
    "notes",
    "leadStatus",
  ];

  for (const fieldKey of FIELD_ORDER) {
    const patterns = getImportFieldAliases(fieldKey);
    let best = null;
    let bestScore = -Infinity;

    for (const header of normalizedHeaders) {
      if (used.has(header.raw)) continue;

      for (const pattern of patterns) {
        const patternKey = normalizeHeaderKey(pattern);
        const exact = header.key === patternKey;
        const partial =
          !exact &&
          patternKey.length >= 5 &&
          header.key.includes(patternKey);

        if (!exact && !partial) continue;

        const score = scoreHeaderForField(fieldKey, patternKey, header.key, {
          exact,
        });
        if (score > bestScore) {
          bestScore = score;
          best = header;
        }
      }
    }

    if (best && bestScore > 0) {
      mapping[fieldKey] = best.raw;
      used.add(best.raw);
    }
  }

  return mapping;
}

export function getProviderById(id) {
  return IMPORT_PROVIDERS.find((p) => p.id === id) || IMPORT_PROVIDERS[0];
}
