import { getSessionFromRequest } from "@/lib/auth";

const DETAILS_API_BASE =
  "https://maps.googleapis.com/maps/api/place/details/json";

/**
 * GET /api/places/details?placeId=ChIJ...
 *
 * Server-side proxy to Google Place Details.
 * Returns formatted address, parsed city/state/zip, and coordinates.
 * Requires an authenticated session.
 */
export async function GET(request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return Response.json(
      { success: false, error: "Unauthenticated" },
      { status: 401 },
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return Response.json(
      { success: false, error: "Places API not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const placeId = (searchParams.get("placeId") || "").trim();

  if (!placeId) {
    return Response.json(
      { success: false, error: "placeId is required" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "formatted_address,address_components,geometry",
    key: apiKey,
  });

  try {
    const res = await fetch(`${DETAILS_API_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return Response.json(
        { success: false, error: "Upstream error" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const result = data.result || {};
    const components = result.address_components || [];

    // ── Parse address_components ─────────────────────────────────────────
    const get = (type, nameType = "long_name") => {
      const c = components.find((c) => c.types.includes(type));
      return c ? c[nameType] : "";
    };

    const streetNumber = get("street_number");
    const route = get("route");
    const street = [streetNumber, route].filter(Boolean).join(" ");

    // City prefers locality, falls back to sublocality / administrative_area_level_3
    const city =
      get("locality") ||
      get("sublocality_level_1") ||
      get("administrative_area_level_3");

    // State short code (IL, TX, etc.)
    const state = get("administrative_area_level_1", "short_name");

    const zip = get("postal_code");
    const formattedAddress = result.formatted_address || "";
    const latitude = result.geometry?.location?.lat ?? null;
    const longitude = result.geometry?.location?.lng ?? null;

    return Response.json(
      {
        success: true,
        street,
        city,
        state,
        zip,
        formattedAddress,
        latitude,
        longitude,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=300" },
      },
    );
  } catch (_err) {
    return Response.json(
      { success: false, error: "Request failed" },
      { status: 500 },
    );
  }
}
