import "server-only";

/**
 * Draft / publish snapshot helpers for issue #43.
 *
 * Architecture:
 *   - Public site routes keep reading from the top-level columns
 *     (headline, subheadline, about_text, cta_text, theme_color,
 *      services, gallery_photos, site_meta, published).
 *   - The builder reads & writes a draft snapshot in
 *     `contractor_websites.draft_content` (jsonb). Edits never touch
 *     the top-level columns directly. Only POST /publish copies the
 *     draft into the top-level columns atomically.
 *
 * This module owns the shape of that draft snapshot and the merge /
 * promotion helpers used by the API routes.
 */

const DRAFT_FIELDS = [
  "headline",
  "subheadline",
  "aboutText",
  "ctaText",
  "themeColor",
  "services",
  "galleryPhotos",
  "siteMeta",
];

/**
 * Build a complete draft snapshot for a row, falling back to the live
 * top-level columns when the draft column is empty or missing keys.
 * Used by the builder GET to render the draft view.
 */
export function readWebsiteDraftSnapshot(row) {
  const raw =
    row?.draft_content && typeof row.draft_content === "object"
      ? row.draft_content
      : {};
  const liveSiteMeta =
    row?.site_meta && typeof row.site_meta === "object" ? row.site_meta : {};

  return {
    headline: typeof raw.headline === "string" ? raw.headline : row?.headline || "",
    subheadline:
      typeof raw.subheadline === "string" ? raw.subheadline : row?.subheadline || "",
    aboutText:
      typeof raw.aboutText === "string" ? raw.aboutText : row?.about_text || "",
    ctaText: typeof raw.ctaText === "string" ? raw.ctaText : row?.cta_text || "",
    themeColor:
      typeof raw.themeColor === "string" ? raw.themeColor : row?.theme_color || "",
    services: Array.isArray(raw.services)
      ? raw.services
      : Array.isArray(row?.services)
        ? row.services
        : [],
    galleryPhotos: Array.isArray(raw.galleryPhotos)
      ? raw.galleryPhotos
      : Array.isArray(row?.gallery_photos)
        ? row.gallery_photos
        : [],
    siteMeta:
      raw.siteMeta && typeof raw.siteMeta === "object" ? raw.siteMeta : liveSiteMeta,
  };
}

/**
 * Returns the slice of fields that exist in the live snapshot (top-level
 * columns) so the builder can compare draft vs live and show a "Discard
 * draft" affordance only when something actually differs.
 */
export function readWebsiteLiveSnapshot(row) {
  const liveSiteMeta =
    row?.site_meta && typeof row.site_meta === "object" ? row.site_meta : {};
  return {
    headline: row?.headline || "",
    subheadline: row?.subheadline || "",
    aboutText: row?.about_text || "",
    ctaText: row?.cta_text || "",
    themeColor: row?.theme_color || "",
    services: Array.isArray(row?.services) ? row.services : [],
    galleryPhotos: Array.isArray(row?.gallery_photos) ? row.gallery_photos : [],
    siteMeta: liveSiteMeta,
  };
}

/**
 * Merge a partial patch into an existing draft snapshot. Returns a new
 * object with only the recognized fields; unknown keys are ignored.
 */
export function mergeWebsiteDraftPatch(currentDraft, patch) {
  const next = { ...(currentDraft || {}) };
  if (!patch || typeof patch !== "object") return next;
  for (const field of DRAFT_FIELDS) {
    if (patch[field] !== undefined) {
      next[field] = patch[field];
    }
  }
  return next;
}

/**
 * Convert a draft snapshot into the column-shaped patch used by the
 * publish endpoint when promoting the draft into the live columns.
 */
export function draftSnapshotToColumnPatch(draft) {
  const patch = {};
  if (draft.headline !== undefined) patch.headline = draft.headline;
  if (draft.subheadline !== undefined) patch.subheadline = draft.subheadline;
  if (draft.aboutText !== undefined) patch.about_text = draft.aboutText;
  if (draft.ctaText !== undefined) patch.cta_text = draft.ctaText;
  if (draft.themeColor !== undefined) patch.theme_color = draft.themeColor;
  if (Array.isArray(draft.services)) patch.services = draft.services;
  if (Array.isArray(draft.galleryPhotos)) patch.gallery_photos = draft.galleryPhotos;
  if (draft.siteMeta && typeof draft.siteMeta === "object") {
    patch.site_meta = draft.siteMeta;
  }
  return patch;
}

/**
 * Stable hash of a draft snapshot, used for idempotent publishes and
 * audit-log dedupe. We just JSON.stringify with sorted keys to keep
 * the dependency-free flavor of the rest of the codebase.
 */
export function hashDraftSnapshot(draft) {
  const stable = stableStringify(draft);
  let hash = 0;
  for (let i = 0; i < stable.length; i += 1) {
    hash = (hash * 31 + stable.charCodeAt(i)) | 0;
  }
  return `d${(hash >>> 0).toString(36)}-${stable.length.toString(36)}`;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}
