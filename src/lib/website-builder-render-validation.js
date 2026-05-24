/**
 * Pre-render validation for website builder preview and public payloads.
 * Prevents empty sections and invisible content from reaching users.
 */

function hasImageSrc(src) {
  const value = String(src || "").trim();
  return value.startsWith("http") || value.startsWith("data:image/");
}

export function validateWebsiteRenderPayload(form = {}, meta = {}) {
  const issues = [];
  const repairs = [];

  const services = Array.isArray(form.services) ? form.services : [];
  const galleryPhotos = Array.isArray(form.galleryPhotos) ? form.galleryPhotos : [];
  const heroPhotos = Array.isArray(form.heroPhotos) ? form.heroPhotos : [];

  if (!String(form.headline || "").trim()) {
    issues.push("missing_headline");
  }
  if (!services.length) {
    issues.push("missing_services");
  }

  const galleryWithSrc = galleryPhotos.filter((p) => hasImageSrc(p?.src));
  if (galleryPhotos.length > 0 && galleryWithSrc.length === 0) {
    issues.push("gallery_images_invalid");
    repairs.push("clear_empty_gallery");
  }

  const heroWithSrc = heroPhotos.filter((p) => hasImageSrc(p?.src));
  if (heroPhotos.length > 0 && heroWithSrc.length === 0) {
    issues.push("hero_images_invalid");
    repairs.push("clear_empty_hero_slots");
  }

  if (!String(form.ctaText || "").trim()) {
    repairs.push("default_cta");
  }

  return {
    ok: issues.length === 0,
    issues,
    repairs,
    meta,
  };
}

export function applyWebsiteRenderRepairs(form = {}, validation = {}) {
  const next = { ...form };
  const repairs = validation.repairs || [];

  if (repairs.includes("clear_empty_gallery")) {
    next.galleryPhotos = (next.galleryPhotos || []).filter((p) => hasImageSrc(p?.src));
  }

  if (repairs.includes("clear_empty_hero_slots")) {
    next.heroPhotos = (next.heroPhotos || []).map((p) =>
      hasImageSrc(p?.src) ? p : { ...p, src: "" },
    );
  }

  if (repairs.includes("default_cta") && !String(next.ctaText || "").trim()) {
    next.ctaText = "Get your free quote";
  }

  return next;
}
