import { mergeGalleryAfterSave, normalizeGalleryPhotos } from "@/lib/website-gallery";

/** Serialize overlapping website saves (prevents stale responses wiping gallery). */
export function createSaveQueue() {
  let seq = 0;
  let inFlight = null;

  return {
    nextId() {
      seq += 1;
      return seq;
    },
    async run(task) {
      const id = this.nextId();
      const previous = inFlight;
      const runThis = async () => {
        if (previous) {
          try {
            await previous;
          } catch {
            /* prior save failed — continue */
          }
        }
        return task(id);
      };
      const promise = runThis();
      inFlight = promise;
      try {
        return await promise;
      } finally {
        if (inFlight === promise) inFlight = null;
      }
    },
    isLatest(id) {
      return id === seq;
    },
  };
}

export function mergeFormAfterSave({ serverData, clientForm, mode = "save" }) {
  const serverGallery = normalizeGalleryPhotos(serverData?.galleryPhotos);
  const clientGallery = normalizeGalleryPhotos(clientForm?.galleryPhotos);

  let galleryPhotos = serverGallery;
  if (mode === "save") {
    galleryPhotos = mergeGalleryAfterSave(serverGallery, clientGallery);
  }

  const serverHero = Array.isArray(serverData?.heroPhotos) ? serverData.heroPhotos : [];
  const clientHero = Array.isArray(clientForm?.heroPhotos) ? clientForm.heroPhotos : [];
  let heroPhotos = serverHero;
  if (mode === "save" && clientHero.length) {
    heroPhotos = serverHero.map((slot, i) => {
      const clientSlot = clientHero[i];
      const serverSrc = String(slot?.src || "").trim();
      const clientSrc = String(clientSlot?.src || "").trim();
      if (/^https?:\/\//i.test(serverSrc)) return slot;
      if (/^https?:\/\//i.test(clientSrc) && !serverSrc) {
        return { ...slot, src: clientSrc, alt: clientSlot?.alt || slot?.alt };
      }
      if (clientSrc.startsWith("data:image/") && !serverSrc) {
        return { ...slot, src: clientSrc, alt: clientSlot?.alt || slot?.alt };
      }
      return slot;
    });
  }

  return {
    headline: serverData.headline ?? clientForm.headline ?? "",
    subheadline: serverData.subheadline ?? clientForm.subheadline ?? "",
    aboutText: serverData.aboutText ?? clientForm.aboutText ?? "",
    ctaText: serverData.ctaText ?? clientForm.ctaText ?? "",
    themeColor: serverData.themeColor ?? clientForm.themeColor ?? "#16a34a",
    galleryPhotos,
    heroPhotos,
    services: serverData.services?.length ? serverData.services : clientForm.services,
    testimonials: serverData.testimonials?.length
      ? serverData.testimonials
      : clientForm.testimonials,
    trustBadges: serverData.trustBadges?.length
      ? serverData.trustBadges
      : clientForm.trustBadges,
    socialLinks: serverData.socialLinks || clientForm.socialLinks,
    analytics: serverData.analytics || clientForm.analytics,
  };
}
