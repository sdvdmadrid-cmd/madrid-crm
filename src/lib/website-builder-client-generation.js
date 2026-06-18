/** Client timeouts for Website Builder generation. */
export const WEBSITE_FULL_GENERATE_TIMEOUT_MS = 10_000;
export const WEBSITE_COPY_ENHANCE_TIMEOUT_MS = 22_000;
export const WEBSITE_HERO_IMAGE_TIMEOUT_MS = 90_000;
export const WEBSITE_GALLERY_CONCURRENCY = 4;
export const WEBSITE_GALLERY_BATCH_DEFAULT = 3;

/** Stock placeholder images from instant site generation. */
export function isWebsiteStockImageUrl(src) {
  const value = String(src || "").trim();
  return value.includes("images.unsplash.com/");
}

function heroSlotNeedsAiImage(src) {
  const value = String(src || "").trim();
  if (!value) return true;
  if (value.startsWith("data:image/")) return false;
  if (isWebsiteStockImageUrl(value)) return true;
  return !value.startsWith("http");
}

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
  const slots = findHeroSlotsForAiEnhancement(heroPhotos);
  return slots.length > 0 ? slots[0].index : -1;
}

/** Hero slots that should be upgraded from stock/empty to AI images. */
export function findHeroSlotsForAiEnhancement(heroPhotos = [], imagePresets = []) {
  const slots = [];
  for (let i = 0; i < heroPhotos.length; i += 1) {
    const src = String(heroPhotos[i]?.src || "").trim();
    const prompt = String(heroPhotos[i]?.prompt || imagePresets[i] || "").trim();
    if (!prompt) continue;
    if (heroSlotNeedsAiImage(src)) {
      slots.push({ index: i, prompt });
    }
  }
  return slots;
}

/** Request parallel image generation from the batch API. */
export async function requestWebsiteImagesBatch({
  apiFetch,
  getJsonOrThrow,
  prompts = [],
  style = "realistic",
  mediaKind = "gallery",
  draft = true,
  timeoutMs = WEBSITE_HERO_IMAGE_TIMEOUT_MS,
  signal,
  errorMessage = "Image generation failed",
}) {
  const list = (Array.isArray(prompts) ? prompts : [])
    .map((entry) => String(entry?.prompt || entry || "").trim())
    .filter(Boolean);
  if (list.length === 0) return [];

  const res = await apiFetch("/api/website-builder/generate-images-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompts: list,
      style,
      mediaKind,
      draft,
    }),
    timeoutMs,
    signal,
  });
  const payload = await getJsonOrThrow(res, errorMessage);
  return Array.isArray(payload?.data?.images) ? payload.data.images : [];
}

/** Gallery slots that should be upgraded from stock/empty to AI images. */
export function findGallerySlotsForAiEnhancement(galleryPhotos = [], imagePresets = []) {
  const slots = [];
  for (let i = 0; i < galleryPhotos.length; i += 1) {
    const photo = galleryPhotos[i] || {};
    const src = String(photo.src || "").trim();
    const prompt = String(
      photo.prompt || imagePresets[i + 2] || photo.alt || "",
    ).trim();
    if (!prompt) continue;
    if (heroSlotNeedsAiImage(src)) {
      slots.push({ index: i, prompt, kind: "gallery" });
    }
  }
  return slots;
}

/** Hero + gallery slots for a single parallel batch request. */
export function findWebsiteImageEnhancementPlan(heroPhotos = [], galleryPhotos = [], imagePresets = []) {
  const heroSlots = findHeroSlotsForAiEnhancement(heroPhotos, imagePresets).map((slot) => ({
    ...slot,
    kind: "hero",
  }));
  const gallerySlots = findGallerySlotsForAiEnhancement(galleryPhotos, imagePresets);
  return [...heroSlots, ...gallerySlots];
}

export function resolveWebsiteImageSrc(row) {
  return String(row?.imageUrl || row?.imageDataUrl || "").trim();
}

export function isValidWebsiteImageSrc(src) {
  return src.startsWith("data:image/") || /^https?:\/\//i.test(src);
}

export const WEBSITE_COPY_SECTIONS = ["hero", "services", "trust", "seo"];

/** Merge partial AI section payloads into form + siteMeta. */
export function mergeWebsiteCopySection(baseForm, baseSiteMeta, sectionData = {}) {
  const nextForm = { ...baseForm };
  const nextSiteMeta = { ...baseSiteMeta };

  if (sectionData.headline) nextForm.headline = sectionData.headline;
  if (sectionData.subheadline) nextForm.subheadline = sectionData.subheadline;
  if (sectionData.aboutText) nextForm.aboutText = sectionData.aboutText;
  if (sectionData.ctaText) nextForm.ctaText = sectionData.ctaText;
  if (sectionData.services?.length) nextForm.services = sectionData.services;
  if (sectionData.trustBadges?.length) nextForm.trustBadges = sectionData.trustBadges;
  if (sectionData.themeColor) nextForm.themeColor = sectionData.themeColor;

  if (sectionData.siteMeta && typeof sectionData.siteMeta === "object") {
    Object.assign(nextSiteMeta, sectionData.siteMeta);
  }
  if (sectionData.seoTitle) nextSiteMeta.seoTitle = sectionData.seoTitle;
  if (sectionData.seoDescription) nextSiteMeta.seoDescription = sectionData.seoDescription;

  return { nextForm, nextSiteMeta };
}

/**
 * Enhance website copy with parallel section requests — hero text appears first.
 */
export async function enhanceWebsiteCopyParallel({
  apiFetch,
  getJsonOrThrow,
  catalogServices = [],
  signal,
  timeoutMs,
  onSectionComplete,
}) {
  const sections = WEBSITE_COPY_SECTIONS;

  await Promise.allSettled(
    sections.map(async (section) => {
      try {
        const res = await apiFetch("/api/website-builder/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, services: catalogServices }),
          timeoutMs,
          signal,
        });
        const payload = await getJsonOrThrow(res, `Failed to enhance ${section}`);
        if (typeof onSectionComplete === "function") {
          await onSectionComplete(section, payload?.data || {});
        }
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        console.warn(`[website-builder] copy section "${section}" skipped`, error?.message || error);
      }
    }),
  );
}
