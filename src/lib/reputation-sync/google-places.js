import "server-only";

const DETAILS_API_BASE =
  "https://maps.googleapis.com/maps/api/place/details/json";

/**
 * Fetch up to 5 public Google reviews via Place Details (legacy API).
 * Requires GOOGLE_PLACES_API_KEY with Places API enabled.
 */
export async function fetchGooglePlaceReviews(placeId) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GOOGLE_PLACES_API_KEY is not configured", reviews: [] };
  }

  const id = String(placeId || "").trim();
  if (!id) {
    return { ok: false, error: "Google Place ID is required", reviews: [] };
  }

  const params = new URLSearchParams({
    place_id: id,
    fields: "reviews,rating,user_ratings_total,url,name",
    key: apiKey,
  });

  const res = await fetch(`${DETAILS_API_BASE}?${params.toString()}`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    return { ok: false, error: "Google Places request failed", reviews: [] };
  }

  const data = await res.json();
  if (data.status !== "OK" || !data.result) {
    return {
      ok: false,
      error: data.error_message || data.status || "Place not found",
      reviews: [],
    };
  }

  const result = data.result;
  const sourceUrl = String(result.url || "").trim();
  const reviews = (result.reviews || []).map((review) => ({
    externalId: `time-${review.time}`,
    authorName: review.author_name || "Google user",
    rating: review.rating,
    reviewText: review.text || "",
    reviewDate: review.time
      ? new Date(Number(review.time) * 1000).toISOString()
      : null,
    photoUrl: review.profile_photo_url || "",
    sourceUrl,
    serviceType: "",
  }));

  return {
    ok: true,
    placeName: result.name || "",
    rating: result.rating ?? null,
    totalRatings: result.user_ratings_total ?? null,
    profileUrl: sourceUrl,
    reviews: reviews.filter((r) => r.reviewText),
  };
}
