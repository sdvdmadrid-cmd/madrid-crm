/**
 * Resolve natural-language image references to hero slots or gallery indices.
 */

const ORDINALS = {
  first: 0,
  "1st": 0,
  one: 0,
  second: 1,
  "2nd": 1,
  two: 1,
  third: 2,
  "3rd": 2,
  three: 2,
  fourth: 3,
  "4th": 3,
  four: 3,
  fifth: 4,
  "5th": 4,
  five: 4,
  last: -1,
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveGalleryIndex(message, galleryPhotos = []) {
  const photos = Array.isArray(galleryPhotos) ? galleryPhotos : [];
  if (!photos.length) return null;

  const text = normalizeText(message);

  const digitMatch = text.match(/(?:gallery|image|photo|picture)\s*(?:#|number\s*)?(\d+)/);
  if (digitMatch) {
    const idx = Number(digitMatch[1]) - 1;
    if (idx >= 0 && idx < photos.length) return idx;
  }

  for (const [word, idx] of Object.entries(ORDINALS)) {
    if (
      text.includes(`${word} image`) ||
      text.includes(`${word} photo`) ||
      text.includes(`${word} in the gallery`) ||
      text.includes(`${word} gallery`)
    ) {
      return idx === -1 ? photos.length - 1 : Math.min(idx, photos.length - 1);
    }
  }

  for (let i = 0; i < photos.length; i += 1) {
    const alt = normalizeText(photos[i]?.alt || photos[i]?.caption || "");
    if (!alt) continue;
    const altWords = alt.split(" ").filter((w) => w.length > 3);
    if (altWords.some((w) => text.includes(w))) return i;
  }

  if (text.includes("kitchen") || text.includes("bathroom") || text.includes("before") || text.includes("after")) {
    for (let i = 0; i < photos.length; i += 1) {
      const alt = normalizeText(photos[i]?.alt || "");
      if (
        (text.includes("kitchen") && alt.includes("kitchen")) ||
        (text.includes("bathroom") && alt.includes("bath")) ||
        (text.includes("before") && alt.includes("before")) ||
        (text.includes("after") && alt.includes("after"))
      ) {
        return i;
      }
    }
  }

  return null;
}

export function resolveHeroSlotIndex(message, heroPhotos = []) {
  const slots = Array.isArray(heroPhotos) ? heroPhotos : [];
  const text = normalizeText(message);

  if (text.includes("hero") || text.includes("banner") || text.includes("header")) {
    const digitMatch = text.match(/hero\s*(?:image|photo|slot)?\s*(?:#|number\s*)?(\d+)/);
    if (digitMatch) {
      const idx = Number(digitMatch[1]) - 1;
      if (idx >= 0 && idx < Math.max(slots.length, 4)) return idx;
    }

    for (const [word, idx] of Object.entries(ORDINALS)) {
      if (text.includes(`${word} hero`) || text.includes(`hero ${word}`)) {
        return idx === -1 ? Math.max(0, slots.length - 1) : idx;
      }
    }

    return 0;
  }

  return null;
}

export function buildImageInventory(form = {}) {
  const heroPhotos = Array.isArray(form.heroPhotos) ? form.heroPhotos : [];
  const galleryPhotos = Array.isArray(form.galleryPhotos) ? form.galleryPhotos : [];

  return {
    hero: heroPhotos.map((p, i) => ({
      index: i,
      id: p?.id || `hero-${i}`,
      hasImage: Boolean(String(p?.src || "").trim()),
      alt: String(p?.alt || "").slice(0, 80),
      prompt: String(p?.prompt || "").slice(0, 120),
    })),
    gallery: galleryPhotos.map((p, i) => ({
      index: i,
      id: p?.id || `gallery-${i}`,
      alt: String(p?.alt || p?.caption || "").slice(0, 80),
    })),
  };
}
