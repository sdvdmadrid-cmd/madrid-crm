/**
 * Client search helpers — shared by API routes and (optionally) client-side indexes.
 */

export const CLIENT_SEARCH_DEFAULT_LIMIT = 12;
export const CLIENT_SEARCH_MAX_LIMIT = 25;
export const CLIENT_SEARCH_MIN_QUERY_LENGTH = 1;
export const CLIENT_SEARCH_MAX_QUERY_LENGTH = 80;

/**
 * Normalize user input for PostgREST `.or()` ilike filters (commas break the parser).
 */
export function sanitizeClientSearchQuery(raw) {
  return String(raw || "")
    .trim()
    .slice(0, CLIENT_SEARCH_MAX_QUERY_LENGTH)
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeNameKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePhoneKey(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Collapse duplicate tenant rows that share the same phone or name (common after CSV import).
 * @param {object[]} clients
 */
export function dedupeClientSearchResults(clients) {
  if (!Array.isArray(clients) || clients.length <= 1) {
    return clients || [];
  }

  const seen = new Set();
  const merged = [];

  for (const client of clients) {
    const phoneKey = normalizePhoneKey(client.phone);
    const nameKey = normalizeNameKey(client.name);
    const keys = [];
    if (phoneKey) keys.push(`phone:${phoneKey}`);
    if (nameKey) keys.push(`name:${nameKey}`);
    if (!keys.length) keys.push(`id:${client.id}`);

    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    merged.push(client);
  }

  return merged;
}

/**
 * Build PostgREST OR filter for multi-field client search.
 * @param {string} query sanitized plain-text query
 */
export function buildClientSearchOrFilter(query) {
  const safe = sanitizeClientSearchQuery(query);
  if (!safe) return "";

  const pattern = `%${safe}%`;
  const parts = [
    `name.ilike.${pattern}`,
    `company.ilike.${pattern}`,
    `email.ilike.${pattern}`,
    `address.ilike.${pattern}`,
  ];

  const phoneDigits = digitsOnly(safe);
  if (phoneDigits.length >= 3) {
    parts.push(`phone.ilike.%${phoneDigits}%`);
  } else {
    parts.push(`phone.ilike.${pattern}`);
  }

  return parts.join(",");
}

/**
 * Format a client row for autocomplete display.
 */
export function formatClientSearchOption(client = {}) {
  const name = String(client.name || "").trim() || "—";
  const company = String(client.company || client.companyName || "").trim();
  const phone = String(client.phone || "").trim();
  const email = String(client.email || "").trim();
  const address = String(client.address || "").trim();
  const city = String(client.city || "").trim();
  const state = String(client.state || "").trim();

  const location = [address, city, state].filter(Boolean).join(", ");
  const metaParts = [];
  if (company && company.toLowerCase() !== name.toLowerCase()) {
    metaParts.push(company);
  }
  if (phone) metaParts.push(phone);
  if (email) metaParts.push(email);
  const meta = metaParts.join(" · ");

  return {
    id: client.id,
    name,
    company,
    phone,
    email,
    address,
    location,
    meta,
    subtitle: meta || (location && location.toLowerCase() !== name.toLowerCase() ? location : ""),
    client,
  };
}

/** Single-line label after picking a client in estimate/invoice forms. */
export function formatClientPickerLabel(client = {}) {
  const option = formatClientSearchOption(client);
  if (option.meta) return `${option.name} · ${option.meta}`;
  return option.name;
}
