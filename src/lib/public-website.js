import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

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
].join(",");

const PUBLIC_COMPANY_PROFILE_SELECT = [
  "company_name",
  "public_display_name",
  "phone",
  "logo_data_url",
  "business_type",
].join(",");

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeGalleryPhotos(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((photo) => String(photo?.src || "").startsWith("data:image/"));
}

export async function getPublicWebsiteBySlug(slug) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;

  const { data: website } = await supabaseAdmin
    .from("contractor_websites")
    .select(PUBLIC_WEBSITE_SELECT)
    .eq("slug", normalizedSlug)
    .eq("published", true)
    .maybeSingle();

  if (!website?.tenant_id) {
    return null;
  }

  const { data: companyProfile } = await supabaseAdmin
    .from("company_profiles")
    .select(PUBLIC_COMPANY_PROFILE_SELECT)
    .eq("tenant_id", website.tenant_id)
    .maybeSingle();

  return {
    slug: website.slug,
    tenantId: website.tenant_id,
    headline: website.headline || "",
    subheadline: website.subheadline || "",
    aboutText: website.about_text || "",
    ctaText: website.cta_text || "",
    themeColor: website.theme_color || "",
    services: Array.isArray(website.services) ? website.services : [],
    galleryPhotos: sanitizeGalleryPhotos(website.gallery_photos),
    companyProfile: {
      companyName: companyProfile?.company_name || "",
      publicDisplayName: companyProfile?.public_display_name || "",
      phone: companyProfile?.phone || "",
      logoDataUrl: companyProfile?.logo_data_url || "",
      businessType: companyProfile?.business_type || "",
    },
  };
}