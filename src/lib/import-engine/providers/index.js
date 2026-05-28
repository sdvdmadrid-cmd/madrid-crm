import { JOBBER_HEADER_ALIASES, JOBBER_PROVIDER } from "./jobber.js";

export const IMPORT_PROVIDERS = [
  JOBBER_PROVIDER,
  {
    id: "generic",
    label: "Other / Generic CSV",
    description: "Map columns manually for Housecall Pro, ServiceTitan, spreadsheets, etc.",
  },
];

/** @type {Record<string, Record<string, string[]>>} */
const SMART_HEADER_ALIASES = {
  name: [
    "name",
    "full name",
    "client name",
    "customer name",
    "display name",
    "contact name",
  ],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "email address", "e-mail", "primary email", "contact email"],
  phone: [
    "phone",
    "phone number",
    "mobile",
    "mobile phone",
    "cell",
    "primary phone",
    "contact phone",
  ],
  address: [
    "address",
    "street",
    "street address",
    "service address",
    "property address",
    "address 1",
    "address line 1",
    "street 1",
  ],
  city: ["city", "service city", "property city", "town"],
  state: ["state", "province", "region", "service state"],
  zip: ["zip", "zip code", "postal code", "postal", "service zip"],
  company: ["company", "company name", "business name"],
  notes: ["notes", "note", "client notes", "customer notes", "tags"],
};

/** @type {Record<string, Record<string, string[]>>} */
const PROVIDER_ALIASES = {
  jobber: JOBBER_HEADER_ALIASES,
  generic: SMART_HEADER_ALIASES,
};

/**
 * Suggest a column mapping from CSV headers for a given provider.
 * @param {string[]} headers
 * @param {string} providerId
 * @returns {Record<string, string>}
 */
export function suggestColumnMapping(headers, providerId = "generic") {
  const aliases = PROVIDER_ALIASES[providerId] || {};
  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    key: normalizeHeaderKey(h),
  }));

  /** @type {Record<string, string>} */
  const mapping = {};
  const used = new Set();

  for (const [fieldKey, patterns] of Object.entries(aliases)) {
    for (const pattern of patterns) {
      const match = normalizedHeaders.find(
        (h) => !used.has(h.raw) && h.key === normalizeHeaderKey(pattern),
      );
      if (match) {
        mapping[fieldKey] = match.raw;
        used.add(match.raw);
        break;
      }
    }
  }

  return mapping;
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getProviderById(id) {
  return IMPORT_PROVIDERS.find((p) => p.id === id) || IMPORT_PROVIDERS[1];
}
