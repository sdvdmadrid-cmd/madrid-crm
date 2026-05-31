import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { isMissingColumnError } from "@/lib/company-profile-store";
import { normalizeSiteAnalytics } from "@/lib/site-analytics";
import {
  getWebsiteBuilderPack,
  normalizeHeroPhotos,
  resolveWebsiteIndustryForWebsite,
} from "@/lib/website-builder-industry";
import { normalizeWebsiteSlug } from "@/lib/public-website-routing";
import {
  normalizePortfolio,
  resolvePublicGalleryPhotos,
} from "@/lib/website-gallery";
import {
  filterHomeownerFacingServices,
  resolveWebsiteRequestServices,
} from "@/lib/website-lead-form";
import {
  purifyWebsiteForm,
} from "@/lib/website-content-purity";
import { resolveCompanyLogoUrl } from "@/lib/resolve-company-logo-url";

const PUBLIC_WEBSITE_SELECT = [
  "slug",
  "tenant_id",
  "published",
  "headline",
  "subheadline",
  "about_text",
  "cta_text",
  "theme_color",
  "services",
  "gallery_photos",
  "site_meta",
].join(",");

const PUBLIC_COMPANY_PROFILE_SELECT = [
  "company_name",
  "public_display_name",
  "phone",
  "logo_data_url",
  "logo_url",
  "logo_placement",
  "business_type",
  "business_address",
  "website_url",
  "google_reviews_url",
  "document_language",
].join(",");

function normalizeSocialLinks(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const pick = (key) => {
    const value = String(source[key] || "").trim();
    if (!value) return "";
    if (!/^https?:\/\//i.test(value)) return "";
    return value.slice(0, 500);
  };
  return {
    facebook: pick("facebook"),
    instagram: pick("instagram"),
    yelp: pick("yelp"),
    tiktok: pick("tiktok"),
    linkedin: pick("linkedin"),
    google: pick("google"),
    youtube: pick("youtube"),
  };
}

function normalizeSlug(value) {
  return normalizeWebsiteSlug(value);
}

function sanitizeGalleryPhotos(rows, portfolio) {
  const fromColumn = normalizeGalleryPhotos(rows);
  if (fromColumn.length) return fromColumn;
  return buildFeaturedGallery(portfolio);
}

const PUBLIC_WEBSITE_SELECT_LEGACY = PUBLIC_WEBSITE_SELECT.replace(
  ",site_meta",
  "",
);

async function fetchPublishedWebsiteRow(slug) {
  let { data, error } = await supabaseAdmin
    .from("contractor_websites")
    .select(PUBLIC_WEBSITE_SELECT)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (error && isMissingColumnError(error, "site_meta")) {
    ({ data, error } = await supabaseAdmin
      .from("contractor_websites")
      .select(PUBLIC_WEBSITE_SELECT_LEGACY)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle());
    if (data && !data.site_meta) {
      data.site_meta = {};
    }
  }

  if (error) {
    console.error("[public-website] getPublicWebsiteBySlug", error);
    return null;
  }

  return data;
}

export async function assemblePublicWebsiteFromRow(website) {
  if (!website?.tenant_id) return null;

  const { data: companyProfile } = await supabaseAdmin
    .from("company_profiles")
    .select(PUBLIC_COMPANY_PROFILE_SELECT)
    .eq("tenant_id", website.tenant_id)
    .maybeSingle();

  const meta = website.site_meta && typeof website.site_meta === "object" ? website.site_meta : {};
  const profileForIndustry = {
    businessType: companyProfile?.business_type || "",
    companyName: companyProfile?.company_name || "",
    publicDisplayName: companyProfile?.public_display_name || "",
  };
  const pack = getWebsiteBuilderPack(
    resolveWebsiteIndustryForWebsite(profileForIndustry, meta),
  );
  const heroPhotos = normalizeHeroPhotos(meta.heroPhotos, pack).filter((p) => {
    const src = String(p?.src || "").trim();
    return src.startsWith("data:image/") || /^https?:\/\//i.test(src);
  });
  const testimonials = [];
  const trustBadges =
    Array.isArray(meta.trustBadges) && meta.trustBadges.length > 0
      ? meta.trustBadges
      : pack.trustBadges;

  const socialLinks = normalizeSocialLinks(meta.socialLinks);

  const portfolio = normalizePortfolio(meta.portfolio);
  const industryKey = resolveWebsiteIndustryForWebsite(profileForIndustry, meta);
  const purified = purifyWebsiteForm(
    {
      headline: website.headline || "",
      subheadline: website.subheadline || "",
      aboutText: website.about_text || "",
      ctaText: website.cta_text || "",
      themeColor: website.theme_color || pack.defaultThemeColor,
      services: filterHomeownerFacingServices(
        Array.isArray(website.services) ? website.services : [],
      ),
      trustBadges: trustBadges,
    },
    profileForIndustry,
    industryKey,
  );

  const galleryPhotos = resolvePublicGalleryPhotos(website.gallery_photos, portfolio);

  return {
    slug: website.slug,
    tenantId: website.tenant_id,
    seoTitle: String(meta.seoTitle || "").trim(),
    seoDescription: String(meta.seoDescription || "").trim(),
    footerTagline: String(meta.footerTagline || "").trim(),
    serviceAreas: Array.isArray(meta.serviceAreas)
      ? meta.serviceAreas.map((a) => String(a || "").trim()).filter(Boolean)
      : [],
    headline: purified.headline,
    subheadline: purified.subheadline,
    aboutText: purified.aboutText,
    ctaText: purified.ctaText,
    themeColor: purified.themeColor || website.theme_color || "",
    services: purified.services,
    galleryPhotos,
    portfolio,
    heroPhotos,
    testimonials,
    trustBadges: purified.trustBadges,
    socialLinks,
    analytics: normalizeSiteAnalytics(meta.analytics),
    industryLabel: pack.label,
    industryKey: pack.key,
    requestServices: resolveWebsiteRequestServices({
      services: purified.services,
      requestServices: pack.requestServices,
      industryKey: pack.key,
      businessType: companyProfile?.business_type || "",
    }),
    companyProfile: {
      companyName: companyProfile?.company_name || "",
      publicDisplayName: companyProfile?.public_display_name || "",
      phone: companyProfile?.phone || "",
      logoDataUrl: companyProfile?.logo_data_url || "",
      logoUrl: companyProfile?.logo_url || "",
      logoPlacement: companyProfile?.logo_placement || "top-left",
      businessType: companyProfile?.business_type || "",
      businessAddress: companyProfile?.business_address || "",
      businessCity: "",
      websiteUrl: companyProfile?.website_url || "",
      googleReviewsUrl: companyProfile?.google_reviews_url || "",
      documentLanguage: companyProfile?.document_language || "en",
      resolvedLogoUrl: resolveCompanyLogoUrl({
        logoUrl: companyProfile?.logo_url,
        logoDataUrl: companyProfile?.logo_data_url,
      }),
    },
  };
}

export async function getPublicWebsiteBySlug(slug) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;

  const website = await fetchPublishedWebsiteRow(normalizedSlug);
  if (!website?.tenant_id) return null;

  return assemblePublicWebsiteFromRow(website);
}

export async function listPublishedPublicWebsiteSlugs(limit = 5000) {
  let data = [];
  let error = null;

  try {
    ({ data, error } = await supabaseAdmin
      .from("contractor_websites")
      .select("slug, updated_at")
      .eq("published", true)
      .order("updated_at", { ascending: false })
      .limit(limit));
  } catch (queryError) {
    console.error("[public-website] listPublishedPublicWebsiteSlugs", queryError);
    return [];
  }

  if (error) {
    console.error("[public-website] listPublishedPublicWebsiteSlugs", error);
    return [];
  }

  return (data || [])
    .map((row) => ({
      slug: String(row.slug || "").trim().toLowerCase(),
      updatedAt: row.updated_at || null,
    }))
    .filter((row) => row.slug);
}