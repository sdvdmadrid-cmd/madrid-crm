/** Client timeouts for Website Builder generation. */
export const WEBSITE_FULL_GENERATE_TIMEOUT_MS = 22_000;
export const WEBSITE_HERO_IMAGE_TIMEOUT_MS = 90_000;

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
    testimonials: d.testimonials?.length ? d.testimonials : form.testimonials,
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
