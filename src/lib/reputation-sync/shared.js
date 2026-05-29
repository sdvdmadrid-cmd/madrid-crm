/** Reviews eligible for the public website must come from a platform API sync. */
export function isApiSyncedReview(row) {
  const meta = row?.metadata || {};
  return meta.syncSource === "api" && row?.verified === true;
}

export function parseYelpBusinessIdFromUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    const match = parsed.pathname.match(/\/biz\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch {
    const match = value.match(/yelp\.com\/biz\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  }
}

export function buildExternalId(platform, payload = {}) {
  const id = String(payload.externalId || payload.id || "").trim();
  if (id) return `${platform}:${id}`.slice(0, 200);

  const author = String(payload.authorName || payload.author_name || "anon")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);
  const time = payload.reviewDate || payload.time || payload.created_at || "";
  return `${platform}:${time}:${author}`.slice(0, 200);
}

export function normalizeSyncedReviewRow({
  tenantId,
  platform,
  externalId,
  authorName,
  rating,
  reviewText,
  reviewDate,
  photoUrl = "",
  sourceUrl = "",
  serviceType = "",
}) {
  const text = String(reviewText || "").trim().slice(0, 2000);
  if (!text) return null;

  const now = new Date().toISOString();
  return {
    tenant_id: tenantId,
    platform,
    source_url: String(sourceUrl || "").trim().slice(0, 500),
    author_name: String(authorName || "Customer").trim().slice(0, 120) || "Customer",
    rating:
      rating != null && Number.isFinite(Number(rating))
        ? Math.min(5, Math.max(0, Number(rating)))
        : null,
    review_text: text,
    review_date: reviewDate || now,
    photo_url: String(photoUrl || "").trim().slice(0, 500),
    video_url: "",
    service_type: String(serviceType || "").trim().slice(0, 120),
    verified: true,
    pinned: false,
    hidden: false,
    show_on_website: true,
    metadata: {
      syncSource: "api",
      externalId: buildExternalId(platform, { externalId, authorName, reviewDate }),
      syncedAt: now,
    },
    updated_at: now,
  };
}
