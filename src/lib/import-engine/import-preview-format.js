/**
 * Format client import payloads for preview UI (no duplicate city/state text).
 */

function normalizeLoose(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[,\s]+/g, " ")
    .trim();
}

/**
 * Street line only — omits city/state when the address field only holds locality.
 */
export function formatPreviewStreet(payload = {}) {
  const street = String(payload.address || "").trim();
  if (!street) return "";

  const city = String(payload.city || "").trim();
  const state = String(payload.state || "").trim();
  const zip = String(payload.zip || "").trim();
  const locality = [city, state, zip].filter(Boolean).join(", ");

  if (!locality) return street;

  const streetNorm = normalizeLoose(street);
  const localityNorm = normalizeLoose(locality);

  if (streetNorm === localityNorm) return "";
  if (city && streetNorm.includes(normalizeLoose(city)) && !/\d/.test(street)) {
    return "";
  }

  return street;
}

export function formatPreviewLocality(payload = {}) {
  const city = String(payload.city || "").trim();
  const state = String(payload.state || "").trim();
  const zip = String(payload.zip || "").trim();
  const fromFields = [city, state, zip].filter(Boolean).join(", ");
  if (fromFields) return fromFields;

  const street = String(payload.address || "").trim();
  const cityNorm = normalizeLoose(city);
  if (street && !/\d/.test(street) && normalizeLoose(street) !== cityNorm) {
    return street;
  }

  return "";
}

export function formatPreviewBilling(payload = {}) {
  const line = String(payload.billingAddress || "").trim();
  const locality = [
    payload.billingCity,
    payload.billingState,
    payload.billingZip,
  ]
    .filter(Boolean)
    .join(", ");
  if (line && locality) return `${line} · ${locality}`;
  return line || locality || "";
}
