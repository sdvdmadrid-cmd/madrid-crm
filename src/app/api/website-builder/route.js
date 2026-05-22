import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import {
  getCompanyProfileByTenant,
  isMissingColumnError,
  withDefaultCompanyProfile,
} from "@/lib/company-profile-store";
import { getIndustryProfile } from "@/lib/industry-profiles";
import {
  buildIndustryWebsiteDefaults,
  detectWebsiteContentMismatch,
  getWebsiteBuilderPack,
  normalizeHeroPhotos,
  resolveWebsiteIndustryFromProfile,
} from "@/lib/website-builder-industry";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeSiteAnalytics } from "@/lib/site-analytics";
import {
  persistGalleryPhotosForStorage,
  persistHeroPhotosForStorage,
} from "@/lib/website-media-storage";

const WEBSITE_TABLE = "contractor_websites";

const DEFAULT_THEME_COLOR = "#1d4ed8";
const DEFAULT_CTA_TEXT = "Request Estimate";

function normalizeWebsiteCta(value, fallback = DEFAULT_CTA_TEXT) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;

  const compact = trimmed
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ");

  const looksLikeMarketingTrialCta =
    compact.includes("trial") ||
    compact.includes("start now") ||
    (compact.includes("free") && compact.includes("day"));

  return looksLikeMarketingTrialCta ? fallback : trimmed;
}

function buildDefaultWebsiteContent(companyProfile) {
  const industryKey = resolveWebsiteIndustryFromProfile(companyProfile);
  const pack = getWebsiteBuilderPack(industryKey);
  const defaults = buildIndustryWebsiteDefaults(pack, companyProfile);
  return {
    headline: defaults.headline,
    subheadline: defaults.subheadline,
    aboutText: defaults.aboutText,
    ctaText: defaults.ctaText || DEFAULT_CTA_TEXT,
    themeColor: defaults.themeColor || DEFAULT_THEME_COLOR,
    galleryPhotos: [],
    heroPhotos: defaults.heroPhotos,
    services: defaults.services,
    testimonials: defaults.testimonials,
    trustBadges: defaults.trustBadges,
    requestServices: defaults.requestServices,
  };
}

function readSiteMeta(row, pack) {
  const meta = row?.site_meta && typeof row.site_meta === "object" ? row.site_meta : {};
  const testimonials =
    Array.isArray(meta.testimonials) && meta.testimonials.length > 0
      ? meta.testimonials
      : pack.testimonials;
  const trustBadges =
    Array.isArray(meta.trustBadges) && meta.trustBadges.length > 0
      ? meta.trustBadges
      : pack.trustBadges;
  const heroPhotos = normalizeHeroPhotos(meta.heroPhotos, pack);
  return {
    testimonials: testimonials.slice(0, 4).map((t) => ({
      quote: String(t?.quote || "").slice(0, 280),
      name: String(t?.name || "Customer").slice(0, 60),
      role: String(t?.role || "Local customer").slice(0, 80),
    })),
    trustBadges: trustBadges.slice(0, 6).map((b) => String(b).slice(0, 80)),
    heroPhotos,
  };
}

function serializeWebsiteRow(row, profile, request) {
  const industryKey = resolveWebsiteIndustryFromProfile(profile);
  const pack = getWebsiteBuilderPack(industryKey);
  const industryProfile = getIndustryProfile(profile.businessType || "");
  const defaults = buildDefaultWebsiteContent(profile);
  const meta = readSiteMeta(row, pack);
  const socialLinks =
    row?.site_meta?.socialLinks && typeof row.site_meta.socialLinks === "object"
      ? {
          facebook: String(row.site_meta.socialLinks.facebook || "").slice(0, 500),
          instagram: String(row.site_meta.socialLinks.instagram || "").slice(0, 500),
          yelp: String(row.site_meta.socialLinks.yelp || "").slice(0, 500),
          tiktok: String(row.site_meta.socialLinks.tiktok || "").slice(0, 500),
          linkedin: String(row.site_meta.socialLinks.linkedin || "").slice(0, 500),
          google: String(row.site_meta.socialLinks.google || "").slice(0, 500),
        }
      : {
          facebook: "",
          instagram: "",
          yelp: "",
          tiktok: "",
          linkedin: "",
          google: "",
        };
  const normalizedCtaText = normalizeWebsiteCta(row.cta_text, defaults.ctaText);
  const effectiveServices =
    Array.isArray(row.services) && row.services.length > 0 ? row.services : defaults.services;

  const savedForMismatch = {
    headline: row.headline || "",
    subheadline: row.subheadline || "",
    aboutText: row.about_text || "",
    services: effectiveServices,
  };
  const industryMismatch =
    Boolean(row.headline || row.subheadline || row.about_text) &&
    detectWebsiteContentMismatch(savedForMismatch, industryKey);

  return {
    id: row.id,
    slug: row.slug,
    publicUrl: getPublicWebsiteUrl(row.slug, request),
    websitePath: `/site/${row.slug}`,
    headline: row.headline || defaults.headline,
    subheadline: row.subheadline || defaults.subheadline,
    aboutText: row.about_text || defaults.aboutText,
    ctaText: normalizedCtaText,
    themeColor: row.theme_color || defaults.themeColor,
    galleryPhotos: Array.isArray(row.gallery_photos) ? row.gallery_photos : defaults.galleryPhotos,
    services: effectiveServices,
    testimonials: meta.testimonials,
    trustBadges: meta.trustBadges,
    heroPhotos: meta.heroPhotos,
    socialLinks,
    analytics: normalizeSiteAnalytics(row?.site_meta?.analytics),
    industryMismatch,
    published: row.published === true,
    industry: industryKey,
    industryLabel: pack.label || industryProfile.label,
    industryIcon: pack.icon,
    industryTone: pack.tone,
    themePresets: pack.themeColors,
    imagePresets: pack.imagePresets,
    ctaOptions: pack.ctaOptions,
    requestServices: pack.requestServices,
    companyProfile: profile,
  };
}

function getPublicWebsiteUrl(slug, request) {
  const domain = (process.env.NEXT_PUBLIC_SITE_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  if (!slug) return "";

  if (domain) {
    return `https://${slug}.${domain}`;
  }

  const origin = new URL(request.url).origin;
  return `${origin}/site/${slug}`;
}

function generateSlug(companyName) {
  return String(companyName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40) || "mysite";
}

async function findOrCreateWebsite(tenantDbId, companyProfile) {
  const { data: existing } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .maybeSingle();

  if (existing) return existing;

  const baseSlug = generateSlug(companyProfile?.companyName);
  let slug = baseSlug;
  let attempt = 0;

  // Ensure unique slug
  while (attempt < 10) {
    const { data: conflict } = await supabaseAdmin
      .from(WEBSITE_TABLE)
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!conflict) break;
    attempt++;
    slug = `${baseSlug}${attempt}`;
  }

  const { data, error } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .insert({ tenant_id: tenantDbId, slug })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function GET(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({
      tenantId: access.tenantDbId,
    }),
    access.tenantDbId,
  );

  let row = await findOrCreateWebsite(access.tenantDbId, profile);
  const defaults = buildDefaultWebsiteContent(profile);
  const normalizedCtaText = normalizeWebsiteCta(row.cta_text, defaults.ctaText);

  if (typeof row.cta_text === "string" && normalizedCtaText !== row.cta_text) {
    const { data: patchedRow } = await supabaseAdmin
      .from(WEBSITE_TABLE)
      .update({ cta_text: normalizedCtaText, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("*")
      .maybeSingle();

    if (patchedRow) {
      row = patchedRow;
    }
  }

  return Response.json({
    success: true,
    data: serializeWebsiteRow(row, profile, request),
  });
}

export async function POST(request) {
  try {
  const access = await getAuthenticatedTenantContext(request);
  console.log("[api/website-builder][POST] access", { authenticated: access.authenticated, role: access.role, tenantDbId: access.tenantDbId });
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({
      tenantId: access.tenantDbId,
    }),
    access.tenantDbId,
  );
  const defaults = buildDefaultWebsiteContent(profile);

  const row = await findOrCreateWebsite(access.tenantDbId, profile);

  const patch = {};
  if (typeof body.headline === "string") patch.headline = body.headline.slice(0, 200);
  if (typeof body.subheadline === "string") patch.subheadline = body.subheadline.slice(0, 300);
  if (typeof body.aboutText === "string") patch.about_text = body.aboutText.slice(0, 2000);
  if (typeof body.ctaText === "string") {
    patch.cta_text = normalizeWebsiteCta(body.ctaText, defaults.ctaText).slice(0, 100);
  }
  if (typeof body.themeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.themeColor)) {
    patch.theme_color = body.themeColor;
  }
  if (Array.isArray(body.services)) {
    patch.services = body.services.slice(0, 50).map((s) => ({
      name: String(s.name || "").slice(0, 100),
      description: String(s.description || "").slice(0, 400),
      price: String(s.price || "").slice(0, 50),
    }));
  }
  if (Array.isArray(body.galleryPhotos)) {
    patch.gallery_photos = await persistGalleryPhotosForStorage(
      access.tenantDbId,
      row.slug,
      body.galleryPhotos.slice(0, 8).map((photo) => ({
        src: String(photo?.src || ""),
        alt: String(photo?.alt || "Completed project photo").slice(0, 160),
      })),
    );
  }
  if (typeof body.published === "boolean") patch.published = body.published;

  const existingMeta =
    row?.site_meta && typeof row.site_meta === "object" ? row.site_meta : {};
  const nextMeta = { ...existingMeta };
  let metaChanged = false;

  if (Array.isArray(body.testimonials)) {
    nextMeta.testimonials = body.testimonials.slice(0, 4).map((t) => ({
      quote: String(t?.quote || "").slice(0, 280),
      name: String(t?.name || "Customer").slice(0, 60),
      role: String(t?.role || "Local customer").slice(0, 80),
    }));
    metaChanged = true;
  }
  if (Array.isArray(body.trustBadges)) {
    nextMeta.trustBadges = body.trustBadges.slice(0, 6).map((b) => String(b).slice(0, 80));
    metaChanged = true;
  }
  if (Array.isArray(body.heroPhotos)) {
    const pack = getWebsiteBuilderPack(resolveWebsiteIndustryFromProfile(profile));
    const normalized = normalizeHeroPhotos(body.heroPhotos, pack);
    nextMeta.heroPhotos = await persistHeroPhotosForStorage(
      access.tenantDbId,
      row.slug,
      normalized,
    );
    metaChanged = true;
  }
  if (body.analytics && typeof body.analytics === "object") {
    nextMeta.analytics = normalizeSiteAnalytics(body.analytics);
    metaChanged = true;
  }
  if (body.socialLinks && typeof body.socialLinks === "object") {
    const social = body.socialLinks;
    const pickUrl = (v) => {
      const s = String(v || "").trim();
      return s.startsWith("http") ? s.slice(0, 500) : "";
    };
    nextMeta.socialLinks = {
      facebook: pickUrl(social.facebook),
      instagram: pickUrl(social.instagram),
      yelp: pickUrl(social.yelp),
      tiktok: pickUrl(social.tiktok),
      linkedin: pickUrl(social.linkedin),
      google: pickUrl(social.google),
    };
    metaChanged = true;
  }
  if (metaChanged) {
    patch.site_meta = nextMeta;
  }

  patch.updated_at = new Date().toISOString();

  let { data, error } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error && patch.site_meta && isMissingColumnError(error, "site_meta")) {
    const { site_meta: _ignored, ...patchWithoutMeta } = patch;
    ({ data, error } = await supabaseAdmin
      .from(WEBSITE_TABLE)
      .update(patchWithoutMeta)
      .eq("id", row.id)
      .select("*")
      .single());
    if (data && !data.site_meta) {
      data.site_meta = nextMeta;
    }
  }

  if (error) {
    console.error("[api/website-builder][PATCH] DB error", error);
    return Response.json({ success: false, error: "Unable to save website" }, { status: 500 });
  }

  const publishedSlug = data.slug || row.slug;
  if (publishedSlug) {
    revalidatePath(`/site/${publishedSlug}`);
    revalidatePath(`/site/${publishedSlug}/request`);
  }

    return Response.json({
      success: true,
      data: serializeWebsiteRow(data, profile, request),
    });
  } catch (err) {
    console.error("[api/website-builder][POST] unhandled error", err);
    return Response.json({ success: false, error: err?.message || "Unexpected server error" }, { status: 500 });
  }
}
