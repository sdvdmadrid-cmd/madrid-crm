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
const PROVIDER_ALIASES = {
  jobber: JOBBER_HEADER_ALIASES,
  generic: {},
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
