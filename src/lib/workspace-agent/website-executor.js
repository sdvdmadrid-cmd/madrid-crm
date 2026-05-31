import { buildLandscapingDefaultServices } from "../landscaping-services-catalog.js";
import { analyzeWebsiteCompleteness } from "../website-builder-generation.js";

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
    issues.push("Gallery is empty — upload portfolio photos");
  }
  if (context.website?.brokenGalleryCount > 0) {
    issues.push(`${context.website.brokenGalleryCount} gallery images may not load on the public site`);
  }
  if (!String(snapshot?.siteMeta?.seoTitle || "").trim()) issues.push("Missing SEO title");
  if (completeness.missing?.length) {
    for (const item of completeness.missing.slice(0, 4)) {
      if (!issues.includes(item)) issues.push(item);
    }
  }
  return { issues, completeness };
}

/**
 * @param {string[]} intentIds
 * @param {{ context: object, snapshot: object }} input
 */
export function executeWebsiteIntents(intentIds, { context, snapshot }) {
  const form = snapshot?.form && typeof snapshot.form === "object" ? snapshot.form : {};
  const siteMeta =
    snapshot?.siteMeta && typeof snapshot.siteMeta === "object" ? snapshot.siteMeta : {};

  const actions = [];
  const summaries = [];
  const planSteps = [];
  let patches = {};
  let answerParts = [];

  for (const intentId of intentIds) {
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

    if (intentId === "website.landscaping_catalog") {
      const catalog = buildLandscapingDefaultServices().slice(0, 12);
      patches = { ...patches, services: catalog };
      summaries.push(`Added ${catalog.length} landscaping services to your website draft`);
      planSteps.push("Replace service cards with the landscaping catalog (12 featured services)");
    }

    if (intentId === "website.fix_gallery") {
      summaries.push(
        "Gallery will use portfolio photos and skip broken image URLs on the public site",
      );
      answerParts.push(
        "Broken gallery tiles are replaced with placeholders when images fail to load. Upload photos in the Images panel or Portfolio tab — they sync to the gallery automatically.",
      );
      planSteps.push("Use valid HTTPS portfolio URLs; broken entries show placeholders instead of errors");
    }

    if (intentId === "website.improve_quote_form") {
      answerParts.push(
        "The quote form uses the full industry service dropdown (including Other with a custom description) when your business type is landscaping.",
      );
      summaries.push("Quote request form uses industry-specific service options");
      planSteps.push("Confirm industry is Landscaping in Website Builder settings");
    }

    if (intentId === "website.improve_seo") {
      const company = context.company?.name || "Local contractor";
      const industry = context.industry?.label || "home services";
      patches = {
        ...patches,
        siteMeta: {
          ...siteMeta,
          seoTitle: String(siteMeta.seoTitle || `${company} | ${industry}`).slice(0, 70),
          seoDescription: String(
            siteMeta.seoDescription ||
              `Professional ${industry.toLowerCase()} by ${company}. Request a free estimate today.`,
          ).slice(0, 160),
        },
      };
      summaries.push("Updated SEO title and description in site settings");
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

    if (intentId === "website.improve_hero") {
      answerParts.push(
        "Rewriting hero headline, subheadline, and CTA…",
      );
    }
  }

  const hasPatches = Object.keys(patches).length > 0;

  return {
    actions: hasPatches
      ? [{ type: "website.applyPatches", payload: patches }]
      : [],
    summaries,
    planSteps,
    answerParts,
    patches: hasPatches ? patches : null,
  };
}
