/**
 * Format client rows for list UI and export (street vs city/state split).
 */

function normalizeLoose(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[,\s]+/g, " ")
    .trim();
}

export function isLocalityOnlyAddress(address = "", city = "", state = "", zip = "") {
  const street = String(address || "").trim();
  if (!street) return true;
  if (/\d/.test(street)) return false;

  const locality = [city, state, zip].filter(Boolean).join(", ");
  if (!locality) return false;

  const streetNorm = normalizeLoose(street);
  const localityNorm = normalizeLoose(locality);

  if (streetNorm === localityNorm) return true;
  if (city && streetNorm.includes(normalizeLoose(city)) && !/\d/.test(street)) {
    return true;
  }

  return false;
}

export function splitStreetFromLocality(address = "", city = "", state = "", zip = "") {
  const raw = String(address || "").trim();
  if (!raw || !isLocalityOnlyAddress(raw, city, state, zip)) {
    return { street: raw, city, state, zip };
  }

  return {
    street: "",
    city: city || raw,
    state,
    zip,
  };
}

/**
 * @param {object} client
 */
export function formatClientCardLines(client = {}) {
  const city = client.city || "";
  const state = client.state || "";
  const zip = client.zip || client.zipCode || "";
  const { street } = splitStreetFromLocality(
    client.address,
    city,
    state,
    zip,
  );

  const locality = [city, state, zip].filter(Boolean).join(", ");
  const name = String(client.name || "").trim();
  const company = String(client.company || client.companyName || "").trim();
  const showCompany =
    company && normalizeLoose(company) !== normalizeLoose(name);

  const phone = String(client.phone || "").trim();
  const email = String(client.email || "").trim();
  const missingStreet = Boolean(locality) && !street;

  return {
    name,
    company: showCompany ? company : "",
    phone,
    email,
    street,
    locality,
    missingStreet,
    notes: String(client.notes || "").trim(),
  };
}
