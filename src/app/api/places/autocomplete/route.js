import { getSessionFromRequest } from "@/lib/auth";

const PLACES_API_BASE =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";

/**
 * GET /api/places/autocomplete?input=123+Main
 *
 * Server-side proxy so the Google API key is never sent to the browser.
 * Requires an authenticated session.
 */
export async function GET(request) {
  // Auth check — only signed-in users can query places
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
  const input = (searchParams.get("input") || "").trim();

  if (!input || input.length < 3) {
    return Response.json({ success: true, predictions: [] });
  }

  const params = new URLSearchParams({
    input,
    types: "address",
    language: "en",
    // Restrict to US only
    components: "country:us",
    // Location bias — prioritize Illinois (Chicago area)
    location: "41.8781,-87.6298",
    radius: "200000",
    key: apiKey,
  });

  try {
    const res = await fetch(`${PLACES_API_BASE}?${params.toString()}`, {
      // 3-second hard timeout
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return Response.json(
        { success: false, error: "Upstream error" },
        { status: 502 },
      );
    }

    const data = await res.json();

    // Normalise to the shape the component expects
    const predictions = (data.predictions || []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text || p.description,
      secondaryText: p.structured_formatting?.secondary_text || "",
    }));

    return Response.json(
      { success: true, predictions },
      {
        status: 200,
        headers: {
          // Short browser cache — users typically retry same session quickly
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (_err) {
    return Response.json(
      { success: false, error: "Places lookup failed" },
      { status: 500 },
    );
  }
}
