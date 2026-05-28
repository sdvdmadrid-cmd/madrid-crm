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
  const meta = [company, phone, email].filter(Boolean).join(" · ");

  return {
    id: client.id,
    name,
    company,
    phone,
    email,
    address,
    location,
    meta,
    subtitle: meta || location || "",
    client,
  };
}
