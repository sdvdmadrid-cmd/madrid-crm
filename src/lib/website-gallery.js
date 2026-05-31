/**
 * Gallery & portfolio normalization for Website Builder.
 * Shared between API routes and client (pure functions only in client imports).
 */

export const MAX_FEATURED_GALLERY = 24;
export const MAX_PORTFOLIO_PHOTOS = 2000;
export const MAX_UPLOAD_BATCH = 20;

export function galleryPhotoKey(photo) {
  const id = String(photo?.id || "").trim();
  if (id) return `id:${id}`;
  const src = String(photo?.src || "").trim();
  if (src) return `src:${src.slice(0, 120)}`;
  return "";
}

export function normalizeGalleryPhoto(raw = {}, index = 0) {
  const src = String(raw?.src || "").trim();
  const thumbnail = String(raw?.thumbnail || raw?.src || "").trim();
  const id =
    String(raw?.id || "").trim() ||
    (src ? `g-${index}-${src.slice(-24).replace(/\W/g, "")}` : `g-empty-${index}`);
  return {
    id,
    src,
    thumbnail: thumbnail || src,
    alt: String(raw?.alt || "Project photo").slice(0, 160),
    projectId: String(raw?.projectId || "").trim() || null,
    kind: raw?.kind === "before" || raw?.kind === "after" ? raw.kind : "work",
    persisted: Boolean(raw?.persisted) || /^https?:\/\//i.test(src),
  };
}

export function normalizeGalleryPhotos(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const photo = normalizeGalleryPhoto(rows[i], i);
    if (!photo.src) continue;
    if (!photo.src.startsWith("data:image/") && !/^https?:\/\//i.test(photo.src)) continue;
    const key = galleryPhotoKey(photo);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(photo);
  }
  return out;
}

/** After save: never drop client photos the server failed to persist. */
export function mergeGalleryAfterSave(serverRows, clientRows) {
  const server = normalizeGalleryPhotos(serverRows);
  const client = normalizeGalleryPhotos(clientRows);
  if (!client.length) return server;
  if (!server.length) return client;

  const byKey = new Map();
  for (const photo of server) {
    const key = galleryPhotoKey(photo);
    if (key) byKey.set(key, photo);
  }
  for (const photo of client) {
    const key = galleryPhotoKey(photo);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, photo);
      continue;
    }
    const serverHasHttp = /^https?:\/\//i.test(existing.src);
    const clientHasHttp = /^https?:\/\//i.test(photo.src);
    if (clientHasHttp && !serverHasHttp) {
      byKey.set(key, photo);
    } else if (!serverHasHttp && photo.src) {
      byKey.set(key, photo);
    }
  }

  const merged = Array.from(byKey.values());
  return merged.length >= client.length ? merged : client;
}

export function createPortfolioProject(name = "New project", category = "general") {
  const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: String(name || "New project").slice(0, 120),
    category: String(category || "general").slice(0, 60),
    photos: [],
    createdAt: new Date().toISOString(),
  };
}

export function normalizePortfolio(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const projects = Array.isArray(source.projects) ? source.projects : [];
  let photoCount = 0;
  const normalizedProjects = [];

  for (const project of projects) {
    if (photoCount >= MAX_PORTFOLIO_PHOTOS) break;
    const pid = String(project?.id || "").trim() || `proj-${normalizedProjects.length}`;
    const photos = [];
    const rawPhotos = Array.isArray(project?.photos) ? project.photos : [];
    for (let i = 0; i < rawPhotos.length; i += 1) {
      if (photoCount >= MAX_PORTFOLIO_PHOTOS) break;
      const photo = normalizeGalleryPhoto(
        { ...rawPhotos[i], projectId: pid },
        i,
      );
      if (!photo.src) continue;
      photos.push(photo);
      photoCount += 1;
    }
    normalizedProjects.push({
      id: pid,
      name: String(project?.name || "Project").slice(0, 120),
      category: String(project?.category || "general").slice(0, 60),
      photos,
      createdAt: project?.createdAt || null,
    });
  }

  return {
    version: 1,
    projects: normalizedProjects,
    featuredPhotoIds: Array.isArray(source.featuredPhotoIds)
      ? source.featuredPhotoIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, MAX_FEATURED_GALLERY)
      : [],
  };
}

export function flattenPortfolioPhotos(portfolio) {
  const normalized = normalizePortfolio(portfolio);
  const photos = [];
  for (const project of normalized.projects) {
    for (const photo of project.photos) {
      photos.push({ ...photo, projectId: project.id });
    }
  }
  return photos;
}

export function buildFeaturedGallery(portfolio, explicitFeaturedIds = null) {
  const flat = flattenPortfolioPhotos(portfolio);
  if (!flat.length) return [];

  const ids = Array.isArray(explicitFeaturedIds) ? explicitFeaturedIds : portfolio?.featuredPhotoIds;
  if (Array.isArray(ids) && ids.length > 0) {
    const byId = new Map(flat.map((p) => [p.id, p]));
    const featured = ids.map((id) => byId.get(id)).filter(Boolean);
    if (featured.length) return featured.slice(0, MAX_FEATURED_GALLERY);
  }

  return flat.slice(0, MAX_FEATURED_GALLERY);
}

export function countPortfolioPhotos(portfolio) {
  return flattenPortfolioPhotos(portfolio).length;
}

function isDisplayableGallerySrc(src) {
  const value = String(src || "").trim();
  return (
    value.startsWith("data:image/") ||
    /^https?:\/\//i.test(value)
  );
}

/**
 * Gallery photos for public site + builder preview.
 * Prefers persisted URLs; falls back to portfolio; keeps data URLs for in-builder preview.
 */
export function resolvePublicGalleryPhotos(galleryPhotos, portfolio) {
  const normalized = normalizeGalleryPhotos(galleryPhotos);
  const persisted = normalized.filter(
    (p) => p.persisted || /^https?:\/\//i.test(String(p.src || "")),
  );
  if (persisted.length) return persisted.slice(0, MAX_FEATURED_GALLERY);

  const fromPortfolio = buildFeaturedGallery(portfolio).filter((p) =>
    /^https?:\/\//i.test(String(p.src || "")),
  );
  if (fromPortfolio.length) return fromPortfolio.slice(0, MAX_FEATURED_GALLERY);

  const previewReady = normalized.filter((p) => isDisplayableGallerySrc(p.src));
  return previewReady.slice(0, MAX_FEATURED_GALLERY);
}
