import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPublicWebsiteBySlug } from "@/lib/public-website";

const REVIEW_PLATFORMS = new Set([
  "manual",
  "google",
  "yelp",
  "facebook",
  "instagram",
  "tiktok",
  "houzz",
  "angi",
  "thumbtack",
  "other",
]);

const SOCIAL_PLATFORMS = new Set([
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "yelp",
  "google",
  "houzz",
  "angi",
  "thumbtack",
  "linkedin",
  "other",
]);

export function normalizeReviewPlatform(value) {
  const key = String(value || "manual").trim().toLowerCase();
  return REVIEW_PLATFORMS.has(key) ? key : "other";
}

export function normalizeSocialPlatform(value) {
  const key = String(value || "other").trim().toLowerCase();
  return SOCIAL_PLATFORMS.has(key) ? key : "other";
}

export function serializeReview(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    platform: row.platform || "manual",
    sourceUrl: row.source_url || "",
    authorName: row.author_name || "Customer",
    rating: row.rating != null ? Number(row.rating) : null,
    reviewText: row.review_text || "",
    reviewDate: row.review_date || null,
    photoUrl: row.photo_url || "",
    videoUrl: row.video_url || "",
    serviceType: row.service_type || "",
    verified: row.verified === true,
    pinned: row.pinned === true,
    hidden: row.hidden === true,
    showOnWebsite: row.show_on_website !== false,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeSocialProfile(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    platform: row.platform,
    profileUrl: row.profile_url || "",
    displayOnWebsite: row.display_on_website !== false,
    showLatestContent: row.show_latest_content === true,
    metadata: row.metadata || {},
    updatedAt: row.updated_at,
  };
}

export async function listTenantReviews(tenantId, { includeHidden = true } = {}) {
  let query = supabaseAdmin
    .from("contractor_reviews")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("pinned", { ascending: false })
    .order("review_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (!includeHidden) {
    query = query.eq("hidden", false).eq("show_on_website", true);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (data || []).map(serializeReview);
}

export async function getPublicReviewsBySlug(slug) {
  const website = await getPublicWebsiteBySlug(slug);
  if (!website?.tenantId) return { reviews: [], stats: null };

  const { data, error } = await supabaseAdmin
    .from("contractor_reviews")
    .select(
      "id, platform, author_name, rating, review_text, review_date, photo_url, video_url, verified, pinned, service_type",
    )
    .eq("tenant_id", website.tenantId)
    .eq("show_on_website", true)
    .eq("hidden", false)
    .order("pinned", { ascending: false })
    .order("review_date", { ascending: false, nullsFirst: false })
    .limit(24);

  if (error) {
    if (error.code === "42P01") return { reviews: [], stats: null };
    throw error;
  }

  const reviews = (data || []).map(serializeReview);
  const ratings = reviews.map((r) => r.rating).filter((n) => Number.isFinite(n));
  const avg = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;

  return {
    reviews,
    stats: {
      count: reviews.length,
      averageRating: avg,
      verifiedCount: reviews.filter((r) => r.verified).length,
    },
  };
}

export async function listTenantSocialProfiles(tenantId) {
  const { data, error } = await supabaseAdmin
    .from("contractor_social_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("platform", { ascending: true });

  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (data || []).map(serializeSocialProfile);
}

const WEBSITE_SOCIAL_KEYS = new Set([
  "facebook",
  "instagram",
  "yelp",
  "tiktok",
  "linkedin",
  "google",
  "youtube",
]);

/** Push reputation social profiles into published site_meta.socialLinks (public site only). */
export async function syncTenantSocialLinksToWebsite(tenantId) {
  const profiles = await listTenantSocialProfiles(tenantId);
  const merged = {};
  for (const profile of profiles) {
    if (!profile.displayOnWebsite) continue;
    const url = String(profile.profileUrl || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const key = String(profile.platform || "").toLowerCase();
    if (WEBSITE_SOCIAL_KEYS.has(key)) {
      merged[key] = url.slice(0, 500);
    }
  }

  const { data: website, error: loadError } = await supabaseAdmin
    .from("contractor_websites")
    .select("id, site_meta")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (loadError) {
    if (loadError.code === "42P01") return;
    throw loadError;
  }
  if (!website?.id) return;

  const meta =
    website.site_meta && typeof website.site_meta === "object" ? { ...website.site_meta } : {};
  const existing =
    meta.socialLinks && typeof meta.socialLinks === "object" ? meta.socialLinks : {};

  const { error: updateError } = await supabaseAdmin
    .from("contractor_websites")
    .update({
      site_meta: { ...meta, socialLinks: { ...existing, ...merged } },
      updated_at: new Date().toISOString(),
    })
    .eq("id", website.id);

  if (updateError) throw updateError;
}

export function detectPlatformFromUrl(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("google.com") || value.includes("g.page")) return "google";
  if (value.includes("yelp.com")) return "yelp";
  if (value.includes("facebook.com") || value.includes("fb.com")) return "facebook";
  if (value.includes("instagram.com")) return "instagram";
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("houzz.com")) return "houzz";
  if (value.includes("angi.com") || value.includes("angieslist")) return "angi";
  if (value.includes("thumbtack.com")) return "thumbtack";
  return "other";
}

export const REVIEW_PLATFORM_LABELS = {
  manual: "Manual",
  google: "Google",
  yelp: "Yelp",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  houzz: "Houzz",
  angi: "Angi",
  thumbtack: "Thumbtack",
  other: "Other",
};
