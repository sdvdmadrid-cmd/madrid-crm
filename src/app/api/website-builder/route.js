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
  resolveWebsiteIndustryForWebsite,
  resolveWebsiteIndustryFromProfile,
  resolveWebsiteIndustryKey,
  listWebsiteIndustryPackOptions,
} from "@/lib/website-builder-industry";
import {
  buildPublicWebsitePath,
  buildPublicWebsiteRequestPath,
  buildPublicWebsiteUrl,
  isReservedWebsiteSlug,
  normalizeWebsiteSlug,
  revalidatePublicWebsitePaths,
} from "@/lib/public-website-routing";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeSiteAnalytics } from "@/lib/site-analytics";
import { resolveWebsiteRequestServices } from "@/lib/website-lead-form";
import {
  buildFeaturedGallery,
  MAX_FEATURED_GALLERY,
  normalizeGalleryPhotos,
  normalizePortfolio,
} from "@/lib/website-gallery";
import {
  persistGalleryPhotosForStorage,
  persistHeroPhotosForStorage,
} from "@/lib/website-media-storage";
import {
  draftSnapshotToColumnPatch,
  hashDraftSnapshot,
  mergeWebsiteDraftPatch,
  readWebsiteDraftSnapshot,
  readWebsiteLiveSnapshot,
} from "@/lib/website-draft-snapshot";

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

function buildDefaultWebsiteContent(companyProfile, siteMeta = null) {
  const industryKey = resolveWebsiteIndustryForWebsite(companyProfile, siteMeta);
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
  const siteMetaRow =
    row?.site_meta && typeof row.site_meta === "object" ? row.site_meta : {};
  const industryKey = resolveWebsiteIndustryForWebsite(profile, siteMetaRow);
  const profileIndustryKey = resolveWebsiteIndustryFromProfile(profile);
  const pack = getWebsiteBuilderPack(industryKey);
  const industryProfile = getIndustryProfile(profile.businessType || "");
  const defaults = buildDefaultWebsiteContent(profile, siteMetaRow);
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
    publicUrl: buildPublicWebsiteUrl(row.slug, request),
    websitePath: buildPublicWebsitePath(row.slug),
    requestPath: buildPublicWebsiteRequestPath(row.slug),
    industryKeyOverride: String(siteMetaRow.industryKeyOverride || "").trim() || null,
    profileIndustry: profileIndustryKey,
    industryPackOptions: listWebsiteIndustryPackOptions(),
    headline: row.headline || defaults.headline,
    subheadline: row.subheadline || defaults.subheadline,
    aboutText: row.about_text || defaults.aboutText,
    ctaText: normalizedCtaText,
    themeColor: row.theme_color || defaults.themeColor,
    galleryPhotos: normalizeGalleryPhotos(
      Array.isArray(row.gallery_photos) ? row.gallery_photos : defaults.galleryPhotos,
    ),
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
    requestServices: resolveWebsiteRequestServices({
      services: effectiveServices,
      requestServices: pack.requestServices,
    }),
    companyProfile: profile,
    siteMeta: {
      seoTitle: String(siteMetaRow.seoTitle || "").trim(),
      seoDescription: String(siteMetaRow.seoDescription || "").trim(),
      footerTagline: String(siteMetaRow.footerTagline || "").trim(),
      serviceAreas: Array.isArray(siteMetaRow.serviceAreas)
        ? siteMetaRow.serviceAreas.map((a) => String(a || "").trim()).filter(Boolean)
        : [],
      aiGeneratedAt: siteMetaRow.aiGeneratedAt || null,
      portfolio: normalizePortfolio(siteMetaRow.portfolio),
    },
  };
}

/**
 * Project a database row into the "what the builder sees" shape by
 * overlaying the draft snapshot on top of the live columns. The public
 * site keeps reading the raw row, so this projection is builder-only.
 */
function projectRowForBuilder(row) {
  const draft = readWebsiteDraftSnapshot(row);
  return {
    ...row,
    headline: draft.headline,
    subheadline: draft.subheadline,
    about_text: draft.aboutText,
    cta_text: draft.ctaText,
    theme_color: draft.themeColor,
    services: draft.services,
    gallery_photos: draft.galleryPhotos,
    site_meta: draft.siteMeta,
  };
}

function buildPublishMeta(row, draftSnapshot) {
  const liveSnapshot = readWebsiteLiveSnapshot(row);
  const draftHash = hashDraftSnapshot(draftSnapshot);
  const liveHash = hashDraftSnapshot(liveSnapshot);
  return {
    published: row?.published === true,
    hasUnpublishedChanges:
      row?.has_unpublished_changes === true || draftHash !== liveHash,
    lastPublishedAt: row?.last_published_at || null,
    draftUpdatedAt: row?.draft_updated_at || row?.updated_at || null,
    draftHash,
    liveHash,
  };
}

function generateSlug(companyName) {
  const base =
    normalizeWebsiteSlug(
      String(companyName || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
    ) || "my-company";
  return base.slice(0, 40);
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

    if (!conflict && !isReservedWebsiteSlug(slug)) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
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
  const defaults = buildDefaultWebsiteContent(
    profile,
    row?.site_meta && typeof row.site_meta === "object" ? row.site_meta : null,
  );
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

  const draftSnapshot = readWebsiteDraftSnapshot(row);
  const projected = projectRowForBuilder(row);
  return Response.json({
    success: true,
    data: serializeWebsiteRow(projected, profile, request),
    meta: buildPublishMeta(row, draftSnapshot),
  });
}

export async function POST(request) {
  try {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({
      tenantId: access.tenantDbId,
    }),
    access.tenantDbId,
  );
  const row = await findOrCreateWebsite(access.tenantDbId, profile);
  const defaults = buildDefaultWebsiteContent(
    profile,
    row?.site_meta && typeof row.site_meta === "object" ? row.site_meta : null,
  );

  const patch = {};
  let activeSlug = String(row.slug || "").trim();

  if (typeof body.slug === "string") {
    const nextSlug = normalizeWebsiteSlug(body.slug);
    if (!nextSlug || nextSlug.length < 2) {
      return Response.json(
        { success: false, error: "Site slug must be at least 2 characters." },
        { status: 400 },
      );
    }
    if (isReservedWebsiteSlug(nextSlug)) {
      return Response.json(
        { success: false, error: "That site slug is reserved. Choose another." },
        { status: 400 },
      );
    }
    if (nextSlug !== normalizeWebsiteSlug(row.slug)) {
      const { data: conflict } = await supabaseAdmin
        .from(WEBSITE_TABLE)
        .select("id, tenant_id")
        .eq("slug", nextSlug)
        .maybeSingle();
      if (conflict && conflict.tenant_id !== access.tenantDbId) {
        return Response.json(
          { success: false, error: "That site URL is already taken." },
          { status: 409 },
        );
      }
      patch.slug = nextSlug;
      activeSlug = nextSlug;
    }
  }

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
      activeSlug,
      body.galleryPhotos.slice(0, MAX_FEATURED_GALLERY),
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
  if (typeof body.industryKeyOverride === "string" || body.industryKeyOverride === null) {
    const rawOverride = body.industryKeyOverride;
    if (rawOverride === null || rawOverride === "") {
      delete nextMeta.industryKeyOverride;
      metaChanged = true;
    } else {
      nextMeta.industryKeyOverride = resolveWebsiteIndustryKey(
        String(rawOverride).trim(),
        profile,
      );
      metaChanged = true;
    }
  }

  if (Array.isArray(body.heroPhotos)) {
    const pack = getWebsiteBuilderPack(
      resolveWebsiteIndustryForWebsite(profile, nextMeta),
    );
    const normalized = normalizeHeroPhotos(body.heroPhotos, pack);
    nextMeta.heroPhotos = await persistHeroPhotosForStorage(
      access.tenantDbId,
      activeSlug,
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
  if (body.siteMeta && typeof body.siteMeta === "object") {
    const sm = body.siteMeta;
    if (typeof sm.seoTitle === "string") {
      nextMeta.seoTitle = sm.seoTitle.slice(0, 70);
      metaChanged = true;
    }
    if (typeof sm.seoDescription === "string") {
      nextMeta.seoDescription = sm.seoDescription.slice(0, 160);
      metaChanged = true;
    }
    if (typeof sm.footerTagline === "string") {
      nextMeta.footerTagline = sm.footerTagline.slice(0, 120);
      metaChanged = true;
    }
    if (Array.isArray(sm.serviceAreas)) {
      nextMeta.serviceAreas = sm.serviceAreas
        .map((a) => String(a || "").trim())
        .filter(Boolean)
        .slice(0, 8);
      metaChanged = true;
    }
    if (sm.portfolio && typeof sm.portfolio === "object") {
      nextMeta.portfolio = normalizePortfolio(sm.portfolio);
      metaChanged = true;
      if (!Array.isArray(body.galleryPhotos)) {
        patch.gallery_photos = await persistGalleryPhotosForStorage(
          access.tenantDbId,
          activeSlug,
          buildFeaturedGallery(nextMeta.portfolio),
        );
      }
    }
  }
  if (metaChanged) {
    patch.site_meta = nextMeta;
  }

  // Issue #43: content patches go to draft_content. Only slug + published
  // remain live mutations on this endpoint. Publishing the draft into the
  // top-level columns happens via POST /api/website-builder/publish.
  const livePatch = {};
  if (patch.slug) livePatch.slug = patch.slug;
  if (typeof body.published === "boolean") livePatch.published = body.published;

  const currentDraft = readWebsiteDraftSnapshot(row);
  const draftPatch = {};
  if (patch.headline !== undefined) draftPatch.headline = patch.headline;
  if (patch.subheadline !== undefined) draftPatch.subheadline = patch.subheadline;
  if (patch.about_text !== undefined) draftPatch.aboutText = patch.about_text;
  if (patch.cta_text !== undefined) draftPatch.ctaText = patch.cta_text;
  if (patch.theme_color !== undefined) draftPatch.themeColor = patch.theme_color;
  if (Array.isArray(patch.services)) draftPatch.services = patch.services;
  if (Array.isArray(patch.gallery_photos)) {
    draftPatch.galleryPhotos = patch.gallery_photos;
  }
  if (patch.site_meta) draftPatch.siteMeta = patch.site_meta;

  const nextDraft = mergeWebsiteDraftPatch(currentDraft, draftPatch);
  const draftChanged = Object.keys(draftPatch).length > 0;
  const now = new Date().toISOString();

  const dbPatch = {
    ...livePatch,
    updated_at: now,
  };
  if (draftChanged) {
    dbPatch.draft_content = nextDraft;
    dbPatch.has_unpublished_changes = true;
    dbPatch.draft_updated_at = now;
  }
  // If the user is publishing in the same request (legacy flow), promote
  // the current draft into the live columns atomically.
  if (livePatch.published === true) {
    const promoted = draftSnapshotToColumnPatch(nextDraft);
    Object.assign(dbPatch, promoted);
    dbPatch.has_unpublished_changes = false;
    dbPatch.last_published_at = now;
  }

  let { data, error } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .update(dbPatch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error && isMissingColumnError(error, "draft_content")) {
    // Migration hasn't landed yet — degrade to the old behavior where
    // edits go straight to the live columns and there is no draft.
    const legacyPatch = { ...patch, ...livePatch, updated_at: now };
    ({ data, error } = await supabaseAdmin
      .from(WEBSITE_TABLE)
      .update(legacyPatch)
      .eq("id", row.id)
      .select("*")
      .single());
  }

  if (error) {
    console.error("[api/website-builder][PATCH] DB error", error);
    return Response.json({ success: false, error: "Unable to save website" }, { status: 500 });
  }

  const publishedSlug = data.slug || row.slug;
  const previousSlug = row.slug;
  // Public revalidation is only meaningful when the live snapshot
  // actually changes (slug change, publish/unpublish, or legacy fallback).
  const liveChanged =
    livePatch.slug ||
    livePatch.published !== undefined ||
    dbPatch.headline !== undefined; // legacy fallback path
  if (liveChanged && publishedSlug) {
    revalidatePublicWebsitePaths(publishedSlug, revalidatePath);
  }
  if (liveChanged && previousSlug && previousSlug !== publishedSlug) {
    revalidatePublicWebsitePaths(previousSlug, revalidatePath);
  }

    const projected = projectRowForBuilder(data);
    return Response.json({
      success: true,
      data: serializeWebsiteRow(projected, profile, request),
      meta: buildPublishMeta(data, readWebsiteDraftSnapshot(data)),
    });
  } catch (err) {
    console.error("[api/website-builder][POST] unhandled error", err);
    return Response.json({ success: false, error: err?.message || "Unexpected server error" }, { status: 500 });
  }
}
