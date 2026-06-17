import { buildLandscapingDefaultServices } from "../landscaping-services-catalog.js";
import { analyzeWebsiteCompleteness } from "../website-builder-generation.js";
import { getWebsiteBuilderPack } from "../website-builder-industry.js";
import {
  buildImageInventory,
  resolveGalleryIndex,
  resolveHeroSlotIndex,
} from "./website-image-refs.js";

function stripServicePrices(services = []) {
  return (Array.isArray(services) ? services : []).map((s) => ({
    name: String(s?.name || "").trim(),
    description: String(s?.description || "").trim(),
  }));
}

function buildAnalysisIssues(context, snapshot) {
  const form = snapshot?.form || {};
  const issues = [];
  const completeness = analyzeWebsiteCompleteness(form, snapshot?.siteMeta || {});

  if (!String(form.headline || "").trim()) issues.push("Missing hero headline");
  if (!String(form.subheadline || "").trim()) issues.push("Missing hero subheadline");
  if ((form.services?.length || 0) < 3) issues.push("Few service cards — add more offerings");
  if (context.website?.servicesWithPricingCount > 0) {
    issues.push(`${context.website.servicesWithPricingCount} service cards still show pricing`);
  }
  if ((form.galleryPhotos?.length || 0) === 0) {
    issues.push("Gallery is empty — upload or generate portfolio photos");
  }
  if (context.website?.brokenGalleryCount > 0) {
    issues.push(`${context.website.brokenGalleryCount} gallery images may not load on the public site`);
  }
  if (!String(snapshot?.siteMeta?.seoTitle || "").trim()) issues.push("Missing SEO title");
  if ((form.testimonials?.length || 0) === 0) issues.push("No testimonials section");
  if (completeness.missing?.length) {
    for (const item of completeness.missing.slice(0, 4)) {
      if (!issues.includes(item)) issues.push(item);
    }
  }
  return { issues, completeness };
}

function extractCityFromMessage(message) {
  const match = String(message || "").match(
    /\b(?:in|for|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  );
  return match ? match[1].trim() : "";
}

function parseGalleryCount(message) {
  const text = String(message || "").toLowerCase();
  const numMatch = text.match(/(\d+)\s*(?:gallery|portfolio|project)?\s*(?:images?|photos?)/);
  if (numMatch) return Math.min(10, Math.max(1, Number(numMatch[1])));
  if (text.includes("ten")) return 10;
  if (text.includes("six")) return 6;
  if (text.includes("five")) return 5;
  return 3;
}

function buildImagePrompt(context, snapshot, userMessage, kind = "hero") {
  const pack = getWebsiteBuilderPack(context?.industry?.key || snapshot?.industry);
  const company = context?.company?.name || "local business";
  const prefix = pack.imagePromptPrefix || `${pack.label} professional photography`;
  const detail = String(userMessage || "")
    .replace(/generate|create|replace|new|image|photo|hero|gallery|with|a|an|the/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const subject =
    detail.length > 8
      ? detail
      : kind === "hero"
        ? "modern hero banner showcasing premium work"
        : "completed project portfolio shot";
  return `${prefix}, ${subject}, ${company}, photorealistic, high quality, no text overlay`.slice(
    0,
    320,
  );
}

/**
 * @param {string[]} intentIds
 * @param {{ context: object, snapshot: object, userMessage?: string }} input
 */
export function executeWebsiteIntents(intentIds, { context, snapshot, userMessage = "" }) {
  const form = snapshot?.form && typeof snapshot.form === "object" ? snapshot.form : {};
  const siteMeta =
    snapshot?.siteMeta && typeof snapshot.siteMeta === "object" ? snapshot.siteMeta : {};
  const pack = getWebsiteBuilderPack(context?.industry?.key || snapshot?.industry);
  const msg = String(userMessage || "");

  const actions = [];
  const summaries = [];
  const planSteps = [];
  let patches = {};
  let answerParts = [];

  for (const intentId of intentIds) {
    if (
      intentId === "website.remove_hero_image" &&
      (intentIds.includes("website.replace_hero_image") ||
        intentIds.includes("website.generate_hero_image"))
    ) {
      continue;
    }

    if (intentId === "website.build_full") {
      actions.push({
        type: "website.generateFull",
        payload: {},
        summary: "Generate complete website from industry template + AI copy",
      });
      summaries.push("Building your complete website (layout, copy, branding)");
      planSteps.push("Generate full site from your industry pack with AI-enhanced copy");
      answerParts.push(
        "I'm generating a complete modern website with professional layout, services, trust badges, and SEO-ready copy. Your draft should appear in a few seconds.",
      );
    }

    if (intentId === "website.remove_pricing") {
      const count = (form.services || []).length;
      patches = {
        ...patches,
        services: stripServicePrices(form.services),
        removeServicePricing: true,
      };
      summaries.push(
        count > 0
          ? `Removed public pricing from ${count} service card${count === 1 ? "" : "s"}`
          : "Prepared service cards without public pricing",
      );
      planSteps.push("Strip price fields from all service cards in your website draft");
    }

    if (intentId === "website.industry_services") {
      const catalog = (pack.defaultServices || []).slice(0, 12);
      patches = { ...patches, services: catalog };
      summaries.push(`Added ${catalog.length} ${pack.label} services to your website draft`);
      planSteps.push(`Replace service cards with the ${pack.label} catalog`);
    }

    if (intentId === "website.landscaping_catalog") {
      const catalog = buildLandscapingDefaultServices().slice(0, 12);
      patches = { ...patches, services: catalog };
      summaries.push(`Added ${catalog.length} landscaping services to your website draft`);
      planSteps.push("Replace service cards with the landscaping catalog (12 featured services)");
    }

    if (intentId === "website.add_testimonials") {
      const existing = Array.isArray(form.testimonials) ? form.testimonials : [];
      const fromPack = Array.isArray(pack.testimonials) ? pack.testimonials : [];
      const defaults =
        fromPack.length >= 2
          ? fromPack.slice(0, 4)
          : [
              {
                name: "Sarah M.",
                quote: `Outstanding ${pack.label.toLowerCase()} work — professional, on time, and fairly priced.`,
                rating: 5,
              },
              {
                name: "James T.",
                quote: "Highly recommend. Clear communication and excellent results.",
                rating: 5,
              },
              {
                name: "Maria L.",
                quote: "They transformed our property. Would hire again without hesitation.",
                rating: 5,
              },
            ];
      patches = {
        ...patches,
        testimonials: existing.length >= 2 ? existing : defaults,
      };
      summaries.push(`Added ${(patches.testimonials || []).length} customer testimonials`);
      planSteps.push("Add testimonials section with industry-appropriate reviews");
    }

    if (intentId === "website.premium_look") {
      const premiumColor = pack.themeColors?.[1] || pack.defaultThemeColor || "#0f172a";
      patches = {
        ...patches,
        themeColor: premiumColor,
        trustBadges: pack.trustBadges?.length
          ? pack.trustBadges
          : ["Licensed & Insured", "Free Estimates", "Satisfaction Guaranteed"],
      };
      summaries.push("Applied premium brand colors and trust badges");
      planSteps.push("Switch to premium theme palette and strengthen trust signals");
      answerParts.push("Applying a premium look — I'll also refine your hero copy for a high-end feel.");
    }

    if (intentId === "website.conversion_homepage") {
      patches = {
        ...patches,
        ctaText: pack.ctaOptions?.[0] || "Get Your Free Estimate",
        trustBadges: pack.trustBadges || form.trustBadges,
      };
      summaries.push("Optimized homepage for lead conversion (CTA + trust badges)");
      planSteps.push("Focus hero on conversion with strong CTA and social proof");
    }

    if (intentId === "website.match_brand_colors") {
      patches = { ...patches, themeColor: pack.defaultThemeColor };
      summaries.push(`Updated buttons and accents to ${pack.label} brand color`);
    }

    if (intentId === "website.fix_gallery") {
      summaries.push(
        "Gallery will use portfolio photos and skip broken image URLs on the public site",
      );
      answerParts.push(
        "Broken gallery tiles are replaced with placeholders when images fail to load. Upload photos in the Images panel or ask me to generate gallery images.",
      );
      planSteps.push("Use valid HTTPS portfolio URLs; broken entries show placeholders instead of errors");
    }

    if (intentId === "website.improve_quote_form") {
      answerParts.push(
        "The quote form uses industry-specific service dropdown options based on your business type.",
      );
      summaries.push("Quote request form uses industry-specific service options");
      planSteps.push("Confirm industry is set correctly in Website Builder settings");
    }

    if (intentId === "website.improve_seo") {
      const company = context.company?.name || "Local contractor";
      const industry = context.industry?.label || "home services";
      const city = extractCityFromMessage(msg) || siteMeta.serviceAreas?.[0] || "";
      const locationBit = city ? ` in ${city}` : "";
      patches = {
        ...patches,
        siteMeta: {
          ...siteMeta,
          seoTitle: String(
            siteMeta.seoTitle || `${company} | ${industry}${locationBit}`,
          ).slice(0, 70),
          seoDescription: String(
            siteMeta.seoDescription ||
              `Professional ${industry.toLowerCase()}${locationBit} by ${company}. Licensed, insured, and ready for your project. Request a free estimate today.`,
          ).slice(0, 160),
          serviceAreas: city
            ? [...new Set([...(siteMeta.serviceAreas || []), city])]
            : siteMeta.serviceAreas,
        },
      };
      summaries.push("Updated SEO title, description, and service areas");
      planSteps.push("Set SEO title and meta description for local search");
    }

    if (intentId === "website.mobile_layout") {
      answerParts.push(
        "Public pages use responsive CSS (stacked grids, touch-friendly CTAs, scroll-margin for sticky nav). Preview on a phone or narrow the browser to verify the hero, services grid, and quote form.",
      );
      summaries.push("Mobile layout uses responsive public-site styles");
    }

    if (intentId === "website.analyze") {
      const { issues, completeness } = buildAnalysisIssues(context, snapshot);
      answerParts.push(
        issues.length
          ? `**Site audit (${completeness.score}% complete):**\n${issues.map((i) => `• ${i}`).join("\n")}`
          : `Your site looks solid (${completeness.score}% completeness).`,
      );
    }

    if (intentId === "website.remove_gallery_image") {
      const gallery = Array.isArray(form.galleryPhotos) ? form.galleryPhotos : [];
      const idx = resolveGalleryIndex(msg, gallery);
      if (idx !== null && gallery[idx]) {
        actions.push({
          type: "website.removeGalleryImage",
          payload: { index: idx },
          summary: `Removed gallery image #${idx + 1}`,
        });
        summaries.push(`Removed gallery photo #${idx + 1}${gallery[idx]?.alt ? `: ${gallery[idx].alt}` : ""}`);
      } else if (gallery.length) {
        answerParts.push(
          `I couldn't identify which gallery image to remove. You have ${gallery.length} photo(s). Try: "Remove the second gallery image" or "Delete the image showing the kitchen."`,
        );
      } else {
        answerParts.push("Your gallery is empty — nothing to remove.");
      }
    }

    if (intentId === "website.remove_hero_image") {
      const slotIndex = resolveHeroSlotIndex(msg, form.heroPhotos) ?? 0;
      actions.push({
        type: "website.removeHeroImage",
        payload: { slotIndex },
        summary: `Cleared hero image slot ${slotIndex + 1}`,
      });
      summaries.push(`Removed hero image in slot ${slotIndex + 1}`);
    }

    if (intentId === "website.generate_hero_image") {
      const slotIndex = resolveHeroSlotIndex(msg, form.heroPhotos) ?? 0;
      const prompt = buildImagePrompt(context, snapshot, msg, "hero");
      actions.push({
        type: "website.generateHeroImage",
        payload: { slotIndex, prompt },
        summary: `Generating hero image for slot ${slotIndex + 1}`,
      });
      summaries.push(`Generating AI hero image (slot ${slotIndex + 1}) — about 20 seconds`);
      answerParts.push("Creating a photorealistic hero image matched to your industry…");
    }

    if (intentId === "website.replace_hero_image") {
      const slotIndex = resolveHeroSlotIndex(msg, form.heroPhotos) ?? 0;
      const prompt = buildImagePrompt(context, snapshot, msg, "hero");
      actions.push({
        type: "website.generateHeroImage",
        payload: { slotIndex, prompt },
        summary: `Replacing hero image in slot ${slotIndex + 1}`,
      });
      summaries.push(`Replacing hero image with AI-generated photo`);
    }

    if (intentId === "website.generate_gallery_images") {
      const count = parseGalleryCount(msg);
      const prompt = buildImagePrompt(context, snapshot, msg, "gallery");
      actions.push({
        type: "website.generateGalleryImages",
        payload: { count, prompt },
        summary: `Generating ${count} gallery image${count === 1 ? "" : "s"}`,
      });
      summaries.push(`Generating ${count} AI gallery image${count === 1 ? "" : "s"} — this may take a minute`);
      answerParts.push(
        `Creating ${count} portfolio-style images for your ${pack.label.toLowerCase()} business…`,
      );
      planSteps.push(`Generate ${count} AI gallery images and add to portfolio`);
    }

    if (intentId === "website.improve_hero") {
      answerParts.push("Rewriting hero headline, subheadline, and CTA…");
    }
  }

  const hasPatches = Object.keys(patches).length > 0;

  if (hasPatches) {
    actions.unshift({
      type: "website.applyPatches",
      payload: patches,
      summary: "Applied website content updates",
    });
  }

  return {
    actions,
    summaries,
    planSteps,
    answerParts,
    patches: hasPatches ? patches : null,
  };
}
