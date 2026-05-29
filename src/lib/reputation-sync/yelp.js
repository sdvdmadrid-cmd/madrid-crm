import "server-only";

import { parseYelpBusinessIdFromUrl } from "@/lib/reputation-sync/shared";

export { parseYelpBusinessIdFromUrl };

const YELP_API_BASE = "https://api.yelp.com/v3";

/**
 * Yelp Fusion returns up to 3 review excerpts per business.
 */
export async function fetchYelpBusinessReviews(businessId) {
  const apiKey = process.env.YELP_FUSION_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "YELP_FUSION_API_KEY is not configured", reviews: [] };
  }

  const id = String(businessId || "").trim();
  if (!id) {
    return { ok: false, error: "Yelp business ID is required", reviews: [] };
  }

  const res = await fetch(`${YELP_API_BASE}/businesses/${encodeURIComponent(id)}/reviews`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return {
      ok: false,
      error: body.error?.description || `Yelp API error (${res.status})`,
      reviews: [],
    };
  }

  const data = await res.json();
  const profileUrl = `https://www.yelp.com/biz/${encodeURIComponent(id)}`;
  const reviews = (data.reviews || []).map((review) => ({
    externalId: review.id,
    authorName: review.user?.name || "Yelp user",
    rating: review.rating,
    reviewText: review.text || "",
    reviewDate: review.time_created || null,
    photoUrl: review.user?.image_url || "",
    sourceUrl: profileUrl,
    serviceType: "",
  }));

  return {
    ok: true,
    profileUrl,
    reviews: reviews.filter((r) => r.reviewText),
  };
}

/**
 * Resolve Yelp business id by phone + name (Fusion business search).
 */
export async function resolveYelpBusinessId({ name, phone, address }) {
  const apiKey = process.env.YELP_FUSION_API_KEY;
  if (!apiKey) return { ok: false, error: "YELP_FUSION_API_KEY is not configured", businessId: "" };

  const term = String(name || "").trim();
  const location = String(address || "").trim();
  if (!term && !location) {
    return { ok: false, error: "Business name or address required for Yelp search", businessId: "" };
  }

  const params = new URLSearchParams({ limit: "5" });
  if (term) params.set("term", term);
  if (location) params.set("location", location);
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 10) params.set("phone", digits.slice(-10));

  const res = await fetch(`${YELP_API_BASE}/businesses/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    return { ok: false, error: "Yelp business search failed", businessId: "" };
  }

  const data = await res.json();
  const first = data.businesses?.[0];
  if (!first?.id) {
    return { ok: false, error: "No Yelp business found — paste your Yelp page URL instead", businessId: "" };
  }

  return {
    ok: true,
    businessId: first.id,
    profileUrl: first.url || `https://www.yelp.com/biz/${first.id}`,
    name: first.name,
  };
}
