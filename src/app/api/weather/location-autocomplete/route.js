import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";

function formatSuggestion(result) {
  const stateOrRegion = result.admin1 || result.admin2 || result.country || "";
  const normalizedLocation = [result.name, stateOrRegion].filter(Boolean).join(", ");

  return {
    id: String(result.id || normalizedLocation),
    normalizedLocation,
    primaryText: result.name || normalizedLocation,
    secondaryText: [result.admin1 || result.admin2 || "", result.country || ""]
      .filter(Boolean)
      .join(", "),
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
  };
}

export async function GET(request) {
  const { authenticated } = await getAuthenticatedTenantContext(request);
  if (!authenticated) return unauthenticatedResponse();

  const { searchParams } = new URL(request.url);
  const input = String(searchParams.get("input") || "").trim();

  if (!input || input.length < 2) {
    return Response.json({ success: true, predictions: [] });
  }

  try {
    const params = new URLSearchParams({
      name: input,
      count: "6",
      language: "en",
      format: "json",
    });

    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
      { signal: AbortSignal.timeout(4000) },
    );

    if (!response.ok) {
      return Response.json(
        { success: false, error: "Location autocomplete failed" },
        { status: 502 },
      );
    }

    const payload = await response.json().catch(() => null);
    const results = Array.isArray(payload?.results) ? payload.results : [];

    return Response.json(
      {
        success: true,
        predictions: results.map(formatSuggestion),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch {
    return Response.json(
      { success: false, error: "Location autocomplete failed" },
      { status: 500 },
    );
  }
}