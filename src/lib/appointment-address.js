/**
 * Appointment job-site address helpers (Places-backed validation).
 */

export function buildEmptyAppointmentAddress() {
  return {
    street: "",
    city: "",
    state: "",
    zip: "",
    formattedAddress: "",
    latitude: null,
    longitude: null,
    placeId: "",
    verified: false,
  };
}

export function buildLocationFromAddressParts(address) {
  const stateZip = [address.state, address.zip].filter(Boolean).join(" ");
  return [address.street, address.city, stateZip].filter(Boolean).join(", ");
}

export function parseLocationToAddressParts(location) {
  const raw = String(location || "").trim();
  if (!raw) return buildEmptyAppointmentAddress();
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const address = buildEmptyAppointmentAddress();
  address.street = parts[0] || "";
  address.city = parts[1] || "";
  const stateZip = parts[2] || "";
  const match = stateZip.match(/^([A-Za-z]{2})(?:\s+([A-Za-z0-9-]{3,10}))?$/);
  if (match) {
    address.state = match[1] || "";
    address.zip = match[2] || "";
  } else {
    address.state = stateZip;
  }
  address.formattedAddress = raw;
  return address;
}

/** Detect obvious junk typed without a real place (e.g. "asdfasdfasdf"). */
export function looksLikeInvalidAddressText(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;

  if (/^[\d\s,.-]+$/.test(raw) && !/[A-Za-z]{3,}/.test(raw)) return true;

  const compact = raw.replace(/\s+/g, "");
  if (compact.length >= 5 && /^(.)\1{3,}$/i.test(compact)) return true;

  if (/^[a-z]{8,}$/i.test(compact) && !/\d/.test(compact)) return true;

  const words = raw.split(/\s+/).filter(Boolean);
  const alphaWords = words.filter((w) => /^[A-Za-z]+$/.test(w));
  if (
    alphaWords.length >= 3 &&
    new Set(alphaWords.map((w) => w.toLowerCase())).size === 1
  ) {
    return true;
  }
  if (words.length >= 3 && new Set(words.map((w) => w.toLowerCase())).size === 1) {
    return true;
  }
  if (words.length >= 3 && words.every((w) => w.length < 3)) return true;

  if (words.length === 1 && words[0].length < 5 && !/\d/.test(words[0])) return true;

  return false;
}

export function hasAddressInput(address) {
  return Boolean(
    String(address?.street || "").trim() ||
      String(address?.city || "").trim() ||
      String(address?.state || "").trim() ||
      String(address?.zip || "").trim(),
  );
}

export function isVerifiedAppointmentAddress(address) {
  if (!hasAddressInput(address)) return true;

  const placeId = String(address?.placeId || "").trim();
  const lat = address?.latitude;
  const lng = address?.longitude;
  const hasCoords =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  if (!address?.verified || !placeId || !hasCoords) return false;

  const street = String(address.street || "").trim();
  const city = String(address.city || "").trim();
  if (street.length < 3 || city.length < 2) return false;

  const blob = [street, city, address.state, address.zip, address.formattedAddress]
    .filter(Boolean)
    .join(" ");
  if (looksLikeInvalidAddressText(blob)) return false;

  return true;
}

/**
 * Client-side validation message key suffix (calendar.errors.*) or empty if OK.
 */
export function getAppointmentAddressValidationError(address, t) {
  if (!hasAddressInput(address)) return "";

  const blob = [
    address.street,
    address.city,
    address.state,
    address.zip,
    address.formattedAddress,
  ]
    .filter(Boolean)
    .join(" ");

  if (looksLikeInvalidAddressText(blob)) {
    return t("calendar.errors.invalidAddress");
  }

  if (!isVerifiedAppointmentAddress(address)) {
    return t("calendar.errors.addressNotVerified");
  }

  return "";
}

/**
 * Server-side validation — returns error string or "".
 */
export function validateAppointmentLocationPayload(body) {
  const location = String(body?.location || "").trim();
  if (!location) return "";

  if (looksLikeInvalidAddressText(location)) {
    return "Enter a valid street address from the suggestions.";
  }

  const placeId = String(body?.addressPlaceId || body?.address_place_id || "").trim();
  const lat = Number(body?.latitude);
  const lng = Number(body?.longitude);
  const hasCoords =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  if (!placeId || !hasCoords) {
    return "Select a valid address from the location suggestions.";
  }

  if (location.length < 8) {
    return "Address is too short. Choose a complete address.";
  }

  return "";
}

export function appointmentGeoFieldsFromBody(body) {
  const lat = Number(body?.latitude);
  const lng = Number(body?.longitude);
  const placeId = String(body?.addressPlaceId || "").trim();

  return {
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    address_place_id: placeId || null,
  };
}
