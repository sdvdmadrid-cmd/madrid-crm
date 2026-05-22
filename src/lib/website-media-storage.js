import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const WEBSITE_MEDIA_BUCKET =
  process.env.SUPABASE_WEBSITE_MEDIA_BUCKET || "website-media";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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
  return `${safeTenant}/${safeSlug}/${kind}/${stamp}-${rand}.${ext}`;
}

export async function uploadWebsiteImageFromDataUrl({
  tenantId,
  slug,
  dataUrl,
  kind = "hero",
}) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return String(dataUrl || "").trim();

  const path = buildObjectPath(tenantId, slug, kind, parsed.ext);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(WEBSITE_MEDIA_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mime,
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
    });
  }
  return out;
}

export async function persistGalleryPhotosForStorage(tenantId, slug, galleryPhotos = []) {
  if (!Array.isArray(galleryPhotos)) return [];
  const out = [];
  for (const photo of galleryPhotos) {
    const src = String(photo?.src || "").trim();
    let nextSrc = src;
    if (src.startsWith("data:image/")) {
      nextSrc = await uploadWebsiteImageFromDataUrl({
        tenantId,
        slug,
        dataUrl: src,
        kind: "gallery",
      });
    }
    out.push({
      src: nextSrc,
      alt: String(photo?.alt || "Completed project photo").slice(0, 160),
    });
  }
  return out.filter((p) => p.src && (p.src.startsWith("http") || p.src.startsWith("data:image/")));
}
