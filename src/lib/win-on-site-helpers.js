export const WIN_ON_SITE_MAX_PHOTOS = 3;
export const WIN_ON_SITE_PHASE = 1;

/**
 * Normalize 1–3 photo data URLs from public lead payloads.
 * Accepts legacy `photoDataUrl` and/or `photoDataUrls[]`.
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
} = {}) {
  const lines = [
    "Create a priced draft estimate for this website lead.",
    serviceNeeded ? `Service requested: ${serviceNeeded}` : null,
    clientName ? `Client name: ${clientName}` : null,
    address ? `Job address: ${address}` : null,
    budgetRange ? `Budget range: ${budgetRange}` : null,
    timeline ? `Timeline: ${timeline}` : null,
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
