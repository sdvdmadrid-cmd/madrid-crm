import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";

const DEFAULT_FALLBACK_LOCATION = "Chicago, IL";

function parseCoordinateLocation(value) {
  const match = String(value || "").match(
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    normalizedLocation: `${latitude},${longitude}`,
  };
}

function formatResolvedLocation(result) {
  if (!result) return "";
  const parts = [
    result.name || "",
    result.admin1 || result.country || result.country_code || "",
  ].filter(Boolean);
  return parts.join(", ");
}

function formatSuggestion(result) {
  const normalizedLocation = formatResolvedLocation(result);
  return {
    id: String(result?.id || normalizedLocation),
    normalizedLocation,
    primaryText: result?.name || normalizedLocation,
    secondaryText: [result?.admin1 || result?.admin2 || "", result?.country || ""]
      .filter(Boolean)
      .join(", "),
    latitude: Number(result?.latitude),
    longitude: Number(result?.longitude),
  };
}

async function searchLocations(name, count = 6) {
  const params = new URLSearchParams({
    name,
    count: String(count),
    language: "en",
    format: "json",
  });

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
    { signal: AbortSignal.timeout(4500) },
  );

  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results;
}

export async function GET(request) {
  const { authenticated } = await getAuthenticatedTenantContext(request);
  if (!authenticated) return unauthenticatedResponse();

  const { searchParams } = new URL(request.url);
  const location = String(searchParams.get("location") || "").trim();
  const fallbackLocation = String(
    searchParams.get("fallbackLocation") || DEFAULT_FALLBACK_LOCATION,
  ).trim() || DEFAULT_FALLBACK_LOCATION;

  if (!location) {
    return Response.json(
      { success: false, error: "location is required" },
      { status: 400 },
    );
  }

  const coordinateLocation = parseCoordinateLocation(location);
  if (coordinateLocation) {
    return Response.json({
      success: true,
      source: "coordinates",
      usedFallback: false,
      suggestions: [],
      ...coordinateLocation,
    });
  }

  try {
    const matches = await searchLocations(location, 6);
    if (!matches) {
      return Response.json(
        { success: false, error: "Unable to resolve location" },
        { status: 502 },
      );
    }

    const suggestions = matches.slice(0, 5).map(formatSuggestion);
    const bestMatch = matches[0];

    if (bestMatch) {
      return Response.json({
        success: true,
        source: "best_match",
        usedFallback: false,
        latitude: Number(bestMatch.latitude),
        longitude: Number(bestMatch.longitude),
        normalizedLocation: formatResolvedLocation(bestMatch) || location,
        suggestions,
      });
    }

    const fallbackMatches = await searchLocations(fallbackLocation, 3);
    const fallbackMatch = fallbackMatches?.[0];
    if (fallbackMatch) {
      return Response.json({
        success: true,
        source: "fallback",
        usedFallback: true,
        requestedLocation: location,
        latitude: Number(fallbackMatch.latitude),
        longitude: Number(fallbackMatch.longitude),
        normalizedLocation: formatResolvedLocation(fallbackMatch) || fallbackLocation,
        suggestions,
      });
    }

    return Response.json({
      success: true,
      source: "fallback_label",
      usedFallback: true,
      requestedLocation: location,
      normalizedLocation: fallbackLocation,
      suggestions,
    });
  } catch {
    return Response.json(
      { success: false, error: "Location lookup failed" },
      { status: 500 },
    );
  }
}