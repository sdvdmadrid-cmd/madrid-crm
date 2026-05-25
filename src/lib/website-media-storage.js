import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeGalleryPhoto } from "@/lib/website-gallery";

export const WEBSITE_MEDIA_BUCKET =
  process.env.SUPABASE_WEBSITE_MEDIA_BUCKET || "website-media";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : mime.includes("gif")
        ? "gif"
        : "jpg";
  return { mime, buffer, ext };
}

function buildObjectPath(tenantId, slug, kind, ext) {
  const safeTenant = String(tenantId || "tenant").replace(/[^a-zA-Z0-9-]/g, "");
  const safeSlug = String(slug || "site").replace(/[^a-zA-Z0-9-]/g, "");
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  const safeKind = String(kind || "media").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 48);
  return `${safeTenant}/${safeSlug}/${safeKind}/${stamp}-${rand}.${ext}`;
}

export async function uploadWebsiteImageBuffer({
  tenantId,
  slug,
  buffer,
  mime = "image/jpeg",
  kind = "gallery",
}) {
  if (!buffer?.length || buffer.length > MAX_IMAGE_BYTES) return "";
  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : "jpg";
  const path = buildObjectPath(tenantId, slug, kind, ext);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(WEBSITE_MEDIA_BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadError) {
    console.error("[website-media-storage] upload failed", uploadError.message);
    return "";
  }

  const { data: publicData } = supabaseAdmin.storage
    .from(WEBSITE_MEDIA_BUCKET)
    .getPublicUrl(path);

  return String(publicData?.publicUrl || "").trim();
}

export async function uploadWebsiteImageFromDataUrl({
  tenantId,
  slug,
  dataUrl,
  kind = "hero",
}) {
  const src = String(dataUrl || "").trim();
  if (/^https?:\/\//i.test(src)) return src;

  const parsed = parseDataUrl(src);
  if (!parsed) return src.startsWith("data:image/") ? src : "";

  const url = await uploadWebsiteImageBuffer({
    tenantId,
    slug,
    buffer: parsed.buffer,
    mime: parsed.mime,
    kind,
  });

  return url || src;
}

/**
 * Issue #40 — upload a company logo (manual upload or AI-generated) into
 * the website-media bucket under logos/{tenantId}/* and return the
 * public HTTPS URL. Accepts a data URL or returns the input untouched
 * if already an HTTPS URL.
 */
export async function uploadCompanyLogoFromDataUrl({ tenantId, dataUrl }) {
  const src = String(dataUrl || "").trim();
  if (/^https?:\/\//i.test(src)) return src;

  const parsed = parseDataUrl(src);
  if (!parsed) return "";

  const safeTenant = String(tenantId || "tenant").replace(/[^a-zA-Z0-9-]/g, "");
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  const path = `logos/${safeTenant}/${stamp}-${rand}.${parsed.ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(WEBSITE_MEDIA_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mime,
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadError) {
    console.error("[website-media-storage] logo upload failed", uploadError.message);
    return "";
  }

  const { data: publicData } = supabaseAdmin.storage
    .from(WEBSITE_MEDIA_BUCKET)
    .getPublicUrl(path);

  return String(publicData?.publicUrl || "").trim();
}

export function isPersistableImageSrc(src) {
  const value = String(src || "").trim();
  return value.startsWith("data:image/") || /^https?:\/\//i.test(value);
}

export async function persistHeroPhotosForStorage(tenantId, slug, heroPhotos = []) {
  if (!Array.isArray(heroPhotos)) return [];
  const out = [];
  for (const slot of heroPhotos) {
    const src = String(slot?.src || "").trim();
    let nextSrc = src;
    if (src.startsWith("data:image/")) {
      nextSrc = await uploadWebsiteImageFromDataUrl({
        tenantId,
        slug,
        dataUrl: src,
        kind: `hero-${slot?.id || "slot"}`,
      });
    }
    out.push({
      id: slot?.id,
      src: nextSrc,
      alt: String(slot?.alt || "").slice(0, 160),
      prompt: String(slot?.prompt || "").slice(0, 320),
      persisted: /^https?:\/\//i.test(nextSrc),
    });
  }
  return out.filter((slot) => {
    const s = String(slot?.src || "").trim();
    return s.startsWith("data:image/") || /^https?:\/\//i.test(s);
  });
}

export async function persistGalleryPhotosForStorage(tenantId, slug, galleryPhotos = []) {
  if (!Array.isArray(galleryPhotos)) return [];
  const out = [];

  for (let i = 0; i < galleryPhotos.length; i += 1) {
    const raw = galleryPhotos[i];
    const base = normalizeGalleryPhoto(raw, i);
    const src = base.src;
    let nextSrc = src;
    let persisted = /^https?:\/\//i.test(src);

    if (src.startsWith("data:image/")) {
      nextSrc = await uploadWebsiteImageFromDataUrl({
        tenantId,
        slug,
        dataUrl: src,
        kind: "gallery",
      });
      persisted = /^https?:\/\//i.test(nextSrc);
    }

    if (!nextSrc) continue;

    const thumbSrc =
      base.thumbnail && base.thumbnail.startsWith("data:image/")
        ? await uploadWebsiteImageFromDataUrl({
            tenantId,
            slug,
            dataUrl: base.thumbnail,
            kind: "thumb",
          })
        : base.thumbnail;

    out.push({
      id: base.id,
      src: nextSrc,
      thumbnail: /^https?:\/\//i.test(thumbSrc) ? thumbSrc : nextSrc,
      alt: base.alt,
      projectId: base.projectId,
      kind: base.kind,
      persisted,
    });
  }

  return out.filter((p) => isPersistableImageSrc(p.src));
}
