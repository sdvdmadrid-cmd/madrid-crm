/**
 * Client search helpers — shared by API routes and (optionally) client-side indexes.
 */

export const CLIENT_SEARCH_DEFAULT_LIMIT = 20;
export const CLIENT_SEARCH_MAX_LIMIT = 50;
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

function tokenizeClientSearchQuery(query) {
  const safe = sanitizeClientSearchQuery(query);
  if (!safe) return [];
  return safe.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Build PostgREST OR filter for multi-field client search.
 * Short queries (1–2 chars) search name/company only to avoid noisy email/address hits.
 * @param {string} query sanitized plain-text query
 */
export function buildClientSearchOrFilter(query) {
  const tokens = tokenizeClientSearchQuery(query);
  if (!tokens.length) return "";

  const parts = [];
  const shortQuery = tokens.every((token) => token.length <= 2);

  for (const token of tokens) {
    const pattern = `%${token}%`;
    parts.push(`name.ilike.${pattern}`, `company.ilike.${pattern}`);

    if (!shortQuery) {
      parts.push(`email.ilike.${pattern}`, `address.ilike.${pattern}`);
      const phoneDigits = digitsOnly(token);
      if (phoneDigits.length >= 3) {
        parts.push(`phone.ilike.%${phoneDigits}%`);
      }
    }
  }

  return parts.join(",");
}

/**
 * Relevance score for ranking client autocomplete (higher = better match).
 */
export function scoreClientSearchMatch(client = {}, query = "") {
  const tokens = tokenizeClientSearchQuery(query);
  if (!tokens.length) return 0;

  const name = normalizeNameKey(client.name);
  const company = normalizeNameKey(client.company || client.companyName || "");
  const email = String(client.email || "").trim().toLowerCase();
  const phone = digitsOnly(client.phone);
  const addressHay = [
    client.address,
    client.city,
    client.state,
    client.zip,
    client.zip_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const qFull = tokens.join(" ");
  let total = 0;

  for (const token of tokens) {
    let best = 0;
    const qDigits = digitsOnly(token);

    if (name === token) best = Math.max(best, 1000);
    else if (name.startsWith(token)) best = Math.max(best, 520);
    else if (name.split(" ").some((word) => word.startsWith(token)))
      best = Math.max(best, 380);
    else if (name.includes(token)) best = Math.max(best, 220);

    if (company.startsWith(token)) best = Math.max(best, 450);
    else if (company.includes(token)) best = Math.max(best, 170);

    if (qDigits.length >= 3) {
      if (phone.startsWith(qDigits)) best = Math.max(best, 400);
      else if (phone.includes(qDigits)) best = Math.max(best, 130);
    }

    const localPart = email.split("@")[0] || "";
    if (localPart.startsWith(token)) best = Math.max(best, 150);
    else if (email.includes(token)) best = Math.max(best, 45);

    if (addressHay.includes(token)) best = Math.max(best, 35);

    if (token.length <= 2 && best > 0 && best < 100) {
      best = 0;
    }

    if (best === 0) return 0;
    total += best;
  }

  if (tokens.length > 1) {
    if (name.includes(qFull)) total += 85;
    else if (company.includes(qFull)) total += 55;
  }

  return total;
}

/**
 * Sort clients by match quality; drop rows with no meaningful match.
 */
export function rankClientSearchResults(query, clients) {
  const tokens = tokenizeClientSearchQuery(query);
  if (!tokens.length) return clients || [];

  return [...(clients || [])]
    .map((client) => ({
      client,
      score: scoreClientSearchMatch(client, query),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return normalizeNameKey(a.client.name).localeCompare(
        normalizeNameKey(b.client.name),
      );
    })
    .map((row) => row.client);
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
  const subtitle =
    meta ||
    (location && location.toLowerCase() !== name.toLowerCase() ? location : "");

  return {
    id: client.id,
    name,
    company,
    phone,
    email,
    address,
    location,
    meta,
    subtitle,
    client,
  };
}

/** Single-line label after picking a client in estimate/invoice forms. */
export function formatClientPickerLabel(client = {}) {
  const option = formatClientSearchOption(client);
  if (option.meta) return `${option.name} · ${option.meta}`;
  return option.name;
}
