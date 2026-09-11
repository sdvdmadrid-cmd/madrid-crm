export const WIN_ON_SITE_MAX_PHOTOS = 12;
export const WIN_ON_SITE_PHASE = 6;

/**
 * Normalize up to WIN_ON_SITE_MAX_PHOTOS photo data URLs from public lead payloads.
 * Accepts legacy `photoDataUrl` and/or `photoDataUrls[]`.
 * Videos are not accepted on the lead form (use the job progress timeline instead).
 */
export function normalizeLeadPhotoDataUrls(body = {}, { maxChars = 1_000_000 } = {}) {
  const fromArray = Array.isArray(body.photoDataUrls) ? body.photoDataUrls : [];
  const legacy = body.photoDataUrl ? [body.photoDataUrl] : [];
  const combined = [...fromArray, ...legacy]
    .map((value) => String(value || "").trim())
    .filter((value) => value.startsWith("data:image/"))
    .map((value) => value.slice(0, maxChars));

  const unique = [];
  for (const url of combined) {
    if (!unique.includes(url)) unique.push(url);
    if (unique.length >= WIN_ON_SITE_MAX_PHOTOS) break;
  }
  return unique;
}

export function buildWinOnSitePrompt({
  serviceNeeded = "",
  description = "",
  address = "",
  budgetRange = "",
  timeline = "",
  clientName = "",
  photoUrls = [],
  areaSqFt = null,
  mapMarkup = null,
} = {}) {
  const lines = [
    "Create a priced draft estimate for this website lead.",
    serviceNeeded ? `Service requested: ${serviceNeeded}` : null,
    clientName ? `Client name: ${clientName}` : null,
    address ? `Job address: ${address}` : null,
    budgetRange ? `Budget range: ${budgetRange}` : null,
    timeline ? `Timeline: ${timeline}` : null,
    areaSqFt ? `Approximate marked area: ${areaSqFt} sq ft` : null,
    mapMarkup?.lat != null && mapMarkup?.lng != null
      ? `Map pin: ${mapMarkup.lat}, ${mapMarkup.lng}`
      : null,
    description ? `Homeowner description:\n${description}` : null,
  ].filter(Boolean);

  const photos = (Array.isArray(photoUrls) ? photoUrls : [])
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .slice(0, WIN_ON_SITE_MAX_PHOTOS);
  if (photos.length) {
    lines.push(
      `Site photos uploaded (${photos.length}). Use them as context; URLs:`,
      ...photos.map((url, i) => `${i + 1}. ${url}`),
    );
  }

  return lines.join("\n\n");
}

export function readDraftEstimateIdFromMetadata(metadata) {
  const id = String(metadata?.draftEstimateId || "").trim();
  return id || null;
}

export function mergeWinOnSiteLeadMetadata(existing = {}, patch = {}) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  const next = { ...base, ...patch };
  if (patch.winOnSite && typeof patch.winOnSite === "object") {
    next.winOnSite = {
      ...(base.winOnSite && typeof base.winOnSite === "object" ? base.winOnSite : {}),
      ...patch.winOnSite,
    };
  }
  if (Array.isArray(patch.photoUrls)) {
    next.photoUrls = patch.photoUrls
      .map((url) => String(url || "").trim())
      .filter(Boolean)
      .slice(0, WIN_ON_SITE_MAX_PHOTOS);
  }
  return next;
}
