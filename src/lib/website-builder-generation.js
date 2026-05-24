import {
  buildIndustryWebsiteDefaults,
  createDefaultHeroPhotoSlots,
  getWebsiteBuilderPack,
  normalizeHeroPhotos,
  personalizeGeneratedContent,
  sanitizeIndustryWebsiteContent,
} from "@/lib/website-builder-industry";

export const WEBSITE_SECTIONS = [
  "hero",
  "about",
  "services",
  "gallery",
  "trust",
  "contact",
  "seo",
  "brand",
];

export function analyzeWebsiteCompleteness(form = {}, meta = {}) {
  const heroPhotos = Array.isArray(form.heroPhotos) ? form.heroPhotos : [];
  const galleryPhotos = Array.isArray(form.galleryPhotos) ? form.galleryPhotos : [];
  const services = Array.isArray(form.services) ? form.services : [];
  const testimonials = Array.isArray(form.testimonials) ? form.testimonials : [];
  const trustBadges = Array.isArray(form.trustBadges) ? form.trustBadges : [];

  const heroImagesFilled = heroPhotos.filter((p) => {
    const src = String(p?.src || "").trim();
    return src.startsWith("http") || src.startsWith("data:image/");
  }).length;

  const checks = {
    headline: Boolean(String(form.headline || "").trim()),
    subheadline: Boolean(String(form.subheadline || "").trim()),
    aboutText: Boolean(String(form.aboutText || "").trim()),
    ctaText: Boolean(String(form.ctaText || "").trim()),
    services: services.length >= 3,
    testimonials: testimonials.length >= 1,
    trustBadges: trustBadges.length >= 2,
    heroImages: heroImagesFilled >= 1,
    heroImagesFull: heroImagesFilled >= Math.min(4, heroPhotos.length || 4),
    gallery: galleryPhotos.length >= 1,
    seoTitle: Boolean(String(meta.seoTitle || "").trim()),
    seoDescription: Boolean(String(meta.seoDescription || "").trim()),
    serviceAreas: Array.isArray(meta.serviceAreas) && meta.serviceAreas.length > 0,
  };

  const missing = [];
  if (!checks.headline) missing.push("hero headline");
  if (!checks.subheadline) missing.push("hero subheadline");
  if (!checks.aboutText) missing.push("about section");
  if (!checks.ctaText) missing.push("call-to-action");
  if (!checks.services) missing.push("services list");
  if (!checks.testimonials) missing.push("testimonials");
  if (!checks.trustBadges) missing.push("trust badges");
  if (!checks.heroImages) missing.push("hero images");
  if (!checks.gallery) missing.push("gallery photos");
  if (!checks.seoTitle) missing.push("SEO title");
  if (!checks.seoDescription) missing.push("SEO description");

  const score =
    Object.values(checks).filter(Boolean).length / Object.keys(checks).length;

  return {
    checks,
    missing,
    score: Math.round(score * 100),
    isEmpty:
      !checks.headline &&
      !checks.aboutText &&
      services.length === 0 &&
      heroImagesFilled === 0,
    isComplete: missing.length === 0,
  };
}

export function buildFullSiteCopyPrompt(pack, ctx) {
  const forbiddenNote = `FORBIDDEN: content for trades outside ${pack.label}.`;

  return `
Company: ${ctx.companyName}
Industry: ${pack.label} (${pack.key}) — ONLY this industry
City/service area: ${ctx.city || "local area"}
Phone: ${ctx.phone || "(not provided)"}
Brand tone: ${pack.tone}

Services catalog (if any):
${ctx.topServices || ctx.defaultServiceNames}

${forbiddenNote}
Required service themes: ${pack.requestServices.join(", ")}

Generate a COMPLETE contractor landing page. JSON only:
{
  "headline": "max 10 words",
  "subheadline": "max 28 words, mention service area when city known",
  "aboutText": "max 90 words, first person plural",
  "ctaText": "max 5 words",
  "footerTagline": "max 16 words",
  "seoTitle": "max 60 chars for Google",
  "seoDescription": "max 155 chars for Google",
  "serviceAreas": ["City or neighborhood", "up to 6 areas"],
  "services": [{ "name": "", "description": "", "price": "From $X or quote" }],
  "testimonials": [{ "quote": "", "name": "First L.", "role": "Homeowner" }],
  "trustBadges": [""],
  "heroImagePrompts": ["4 distinct ${pack.label} photo prompts, photorealistic, no text/logos"],
  "galleryImagePrompts": ["2 ${pack.label} project gallery prompts"]
}

Rules:
- 4 to 6 services, 2 testimonials, 4 trust badges
- heroImagePrompts: exactly 4 items
- galleryImagePrompts: exactly 2 items
- ${pack.label} ONLY — never mix industries
`.trim();
}

export function buildFullSiteFromAi(parsed, pack, profile, existingForm = {}) {
  const defaults = buildIndustryWebsiteDefaults(pack, profile);
  const personalized = personalizeGeneratedContent(
    {
      headline: parsed.headline,
      subheadline: parsed.subheadline,
      aboutText: parsed.aboutText,
      ctaText: parsed.ctaText,
      services: parsed.services,
      testimonials: parsed.testimonials,
      trustBadges: parsed.trustBadges,
    },
    pack,
    profile,
  );

  const content = sanitizeIndustryWebsiteContent(personalized, pack, profile);

  const presetSlots = createDefaultHeroPhotoSlots(pack);
  const aiHeroPrompts = Array.isArray(parsed.heroImagePrompts)
    ? parsed.heroImagePrompts
    : [];
  const heroPhotos = presetSlots.map((slot, index) => {
    const existing = Array.isArray(existingForm.heroPhotos)
      ? existingForm.heroPhotos[index]
      : null;
    const existingSrc = String(existing?.src || "").trim();
    const prompt = String(
      aiHeroPrompts[index] || existing?.prompt || slot.prompt || pack.imagePresets[index] || "",
    ).slice(0, 320);
    return {
      id: slot.id,
      src:
        existingSrc.startsWith("http") || existingSrc.startsWith("data:image/")
          ? existingSrc
          : "",
      alt: String(
        existing?.alt || `${pack.label} project ${index + 1}`,
      ).slice(0, 160),
      prompt,
    };
  });

  const aiGalleryPrompts = Array.isArray(parsed.galleryImagePrompts)
    ? parsed.galleryImagePrompts
    : [];
  const existingGallery = Array.isArray(existingForm.galleryPhotos)
    ? existingForm.galleryPhotos
    : [];

  const galleryPhotos =
    existingGallery.length > 0
      ? existingGallery
      : aiGalleryPrompts.slice(0, 2).map((prompt, index) => ({
          src: "",
          alt: String(prompt || `${pack.label} gallery ${index + 1}`).slice(0, 160),
          prompt: String(prompt || pack.imagePresets[index] || "").slice(0, 320),
        }));

  const city = String(profile?.businessCity || profile?.city || "").trim();
  let serviceAreas = Array.isArray(parsed.serviceAreas) ? parsed.serviceAreas : [];
  serviceAreas = serviceAreas
    .map((a) => String(a || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!serviceAreas.length && city) {
    serviceAreas = [city, `${city} metro`];
  }

  return {
    headline: content.headline,
    subheadline: content.subheadline,
    aboutText: content.aboutText,
    ctaText: content.ctaText,
    themeColor: content.themeColor || pack.defaultThemeColor,
    services: content.services,
    testimonials: content.testimonials,
    trustBadges: content.trustBadges,
    heroPhotos: normalizeHeroPhotos(heroPhotos, pack),
    galleryPhotos,
    siteMeta: {
      seoTitle: String(parsed.seoTitle || content.headline || defaults.headline).slice(
        0,
        70,
      ),
      seoDescription: String(
        parsed.seoDescription || content.subheadline || defaults.subheadline,
      ).slice(0, 160),
      footerTagline: String(
        parsed.footerTagline || `Trusted ${pack.label.toLowerCase()} professionals.`,
      ).slice(0, 120),
      serviceAreas,
      aiGeneratedAt: new Date().toISOString(),
      galleryImagePrompts: aiGalleryPrompts.slice(0, 4),
    },
    galleryImagePrompts: aiGalleryPrompts.slice(0, 4),
  };
}

export function buildWebsiteAssistantSystemPrompt({
  pack,
  profile,
  snapshot,
  completeness,
}) {
  const companyName =
    profile?.publicDisplayName || profile?.companyName || "the contractor";
  const missing =
    completeness?.missing?.length > 0
      ? completeness.missing.join(", ")
      : "none — site structure looks complete";

  return `You are the Website Builder AI co-pilot inside FieldBase.
You help contractors finish and improve THEIR website draft — not generic business advice.

Company: ${companyName}
Industry pack: ${pack.label} (${pack.key})
Published: ${snapshot?.published ? "yes" : "no (draft)"}
Public URL: ${snapshot?.websitePath || "/sites/(slug not set)"}
Completeness score: ${completeness?.score ?? 0}%
Missing sections: ${missing}

Current draft (JSON summary):
${JSON.stringify(
  {
    headline: snapshot?.form?.headline,
    subheadline: snapshot?.form?.subheadline,
    aboutText: snapshot?.form?.aboutText?.slice?.(0, 200),
    ctaText: snapshot?.form?.ctaText,
    servicesCount: snapshot?.form?.services?.length ?? 0,
    heroImagesFilled:
      snapshot?.form?.heroPhotos?.filter((p) => p?.src)?.length ?? 0,
    galleryCount: snapshot?.form?.galleryPhotos?.length ?? 0,
    testimonialsCount: snapshot?.form?.testimonials?.length ?? 0,
    seoTitle: snapshot?.siteMeta?.seoTitle,
  },
  null,
  2,
)}

Respond in the user's language when possible.
Be specific about what is missing on THEIR site and what to click in the builder (Generate my website, section regen, Publish).
If they ask why the site is incomplete, reference the missing list above.
Never pretend to be a generic proposal writer.

When you can suggest concrete copy fixes, include a JSON block at the end:
{"patches":{"headline":"...","subheadline":"...","aboutText":"...","ctaText":"..."}}
Only include fields you are improving. Omit the block if no edits suggested.`;
}

export function parseAssistantPatches(rawText) {
  const text = String(rawText || "");
  const match = text.match(/\{[\s\S]*"patches"[\s\S]*\}\s*$/);
  if (!match) {
    return { answer: text.trim(), patches: null };
  }
  try {
    const parsed = JSON.parse(match[0]);
    const answer = text.slice(0, match.index).trim();
    const patches =
      parsed?.patches && typeof parsed.patches === "object" ? parsed.patches : null;
    return { answer, patches };
  } catch {
    return { answer: text.trim(), patches: null };
  }
}
