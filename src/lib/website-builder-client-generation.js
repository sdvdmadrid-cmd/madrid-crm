/** Client timeouts for Website Builder generation. */
export const WEBSITE_FULL_GENERATE_TIMEOUT_MS = 10_000;
export const WEBSITE_COPY_ENHANCE_TIMEOUT_MS = 22_000;
export const WEBSITE_HERO_IMAGE_TIMEOUT_MS = 90_000;
export const WEBSITE_GALLERY_CONCURRENCY = 3;

/** Run async tasks with a concurrency limit. */
export async function runWithConcurrency(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];

  const results = new Array(list.length);
  let nextIndex = 0;
  const poolSize = Math.max(1, Math.min(limit, list.length));

  async function runWorker() {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
}

export function mergeFullSiteIntoDraft({ form, siteMeta, data }) {
  const d = data || {};
  const nextSiteMeta = {
    ...siteMeta,
    ...(d.siteMeta || {}),
  };
  const nextForm = {
    ...form,
    headline: d.headline || form.headline || "",
    subheadline: d.subheadline || form.subheadline || "",
    aboutText: d.aboutText || form.aboutText || "",
    ctaText: d.ctaText || form.ctaText || "",
    themeColor: d.themeColor || form.themeColor,
    services: d.services?.length ? d.services : form.services,
    testimonials: [],
    trustBadges: d.trustBadges?.length ? d.trustBadges : form.trustBadges,
    heroPhotos: d.heroPhotos?.length ? d.heroPhotos : form.heroPhotos,
    galleryPhotos: d.galleryPhotos?.length ? d.galleryPhotos : form.galleryPhotos,
  };
  return { nextForm, nextSiteMeta };
}

/** First empty hero slot index, or -1 if all filled. */
export function findFirstEmptyHeroSlotIndex(heroPhotos = []) {
  for (let i = 0; i < heroPhotos.length; i += 1) {
    const src = String(heroPhotos[i]?.src || "").trim();
    if (!src.startsWith("http") && !src.startsWith("data:image/")) {
      const prompt = String(heroPhotos[i]?.prompt || "").trim();
      if (prompt) return i;
    }
  }
  return -1;
}
