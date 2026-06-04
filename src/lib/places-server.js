import "server-only";

import { looksLikeInvalidAddressText } from "@/lib/appointment-address";

const AUTOCOMPLETE_BASE =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const DETAILS_BASE =
  "https://maps.googleapis.com/maps/api/place/details/json";

/**
 * Resolve a free-text US address to verified place fields (server-side).
 * Used by the workspace agent when scheduling appointments from voice/text.
 */
export async function resolveAddressFromText(input) {
  const text = String(input || "").trim();
  if (!text || text.length < 5) {
    return { ok: false, error: "Address text is too short." };
  }
  if (looksLikeInvalidAddressText(text)) {
    return { ok: false, error: "Address looks invalid. Use a real street address." };
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Google Places is not configured on this server." };
  }

  const acParams = new URLSearchParams({
    input: text,
    types: "address",
    language: "en",
    components: "country:us",
    key: apiKey,
  });

  try {
    const acRes = await fetch(`${AUTOCOMPLETE_BASE}?${acParams.toString()}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!acRes.ok) return { ok: false, error: "Places autocomplete failed." };
    const acJson = await acRes.json();
    const prediction = acJson?.predictions?.[0];
    if (!prediction?.place_id) {
      return { ok: false, error: "No matching address found. Try a more specific street address." };
    }

    const detailParams = new URLSearchParams({
      place_id: prediction.place_id,
      fields: "formatted_address,address_components,geometry",
      key: apiKey,
    });
    const detRes = await fetch(`${DETAILS_BASE}?${detailParams.toString()}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!detRes.ok) return { ok: false, error: "Place details lookup failed." };
    const detJson = await detRes.json();
    const result = detJson?.result || {};
    const components = result.address_components || [];

    const get = (type, nameType = "long_name") => {
      const c = components.find((comp) => comp.types.includes(type));
      return c ? c[nameType] : "";
    };

    const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
    const city =
      get("locality") ||
      get("sublocality_level_1") ||
      get("administrative_area_level_3");
    const state = get("administrative_area_level_1", "short_name");
    const zip = get("postal_code");
    const formattedAddress = result.formatted_address || prediction.description || text;
    const latitude = result.geometry?.location?.lat ?? null;
    const longitude = result.geometry?.location?.lng ?? null;

    if (!street || !city || latitude == null || longitude == null) {
      return { ok: false, error: "Could not verify a complete street address." };
    }

    return {
      ok: true,
      location: formattedAddress,
      street,
      city,
      state,
      zip,
      formattedAddress,
      latitude,
      longitude,
      placeId: prediction.place_id,
    };
  } catch {
    return { ok: false, error: "Address lookup timed out. Try again." };
  }
}
