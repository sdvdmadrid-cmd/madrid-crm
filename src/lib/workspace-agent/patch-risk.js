/**
 * Decide whether website patches need user confirmation before apply.
 */

const MINOR_FORM_KEYS = new Set(["headline", "subheadline", "ctaText", "aboutText"]);

export function patchRequiresConfirmation(patches) {
  if (!patches || typeof patches !== "object") return false;

  if (patches.removeServicePricing === true) return true;

  if (Array.isArray(patches.services)) return true;

  if (Array.isArray(patches.trustBadges) || Array.isArray(patches.galleryPhotos)) {
    return true;
  }

  if (patches.siteMeta && typeof patches.siteMeta === "object") {
    const keys = Object.keys(patches.siteMeta);
    const seoOnly = keys.every((k) => k === "seoTitle" || k === "seoDescription");
    if (!seoOnly) return true;
  }

  const formKeys = Object.keys(patches).filter(
    (k) => patches[k] !== undefined && k !== "siteMeta" && k !== "removeServicePricing",
  );

  if (formKeys.some((k) => !MINOR_FORM_KEYS.has(k))) return true;

  return false;
}

export function isHeroOnlyPatch(patches) {
  if (!patches || typeof patches !== "object") return false;
  const keys = Object.keys(patches).filter((k) => patches[k] !== undefined);
  return keys.every((k) => MINOR_FORM_KEYS.has(k));
}
