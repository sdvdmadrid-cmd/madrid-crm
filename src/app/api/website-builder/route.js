import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { getIndustryProfile } from "@/lib/industry-profiles";
import { supabaseAdmin } from "@/lib/supabase-admin";

const WEBSITE_TABLE = "contractor_websites";

function getPublicWebsiteUrl(slug) {
  const domain = (process.env.NEXT_PUBLIC_SITE_DOMAIN || "FieldBase.com")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  if (!slug) return "";
  return `https://${slug}.${domain}`;
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

  const baseSlug = generateSlug(companyProfile.companyName);
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

  const profile = await getCompanyProfileByTenant({
    tenantId: access.tenantDbId,
  });

  const row = await findOrCreateWebsite(access.tenantDbId, profile);
  const industryProfile = getIndustryProfile(profile.businessType || "");
  const effectiveServices =
    Array.isArray(row.services) && row.services.length > 0
      ? row.services
      : industryProfile.websiteServices.map((name) => ({
          name,
          description: "",
          price: "",
        }));

  return Response.json({
    success: true,
    data: {
      id: row.id,
      slug: row.slug,
      publicUrl: getPublicWebsiteUrl(row.slug),
      websitePath: `/site/${row.slug}`,
      headline: row.headline || "",
      subheadline: row.subheadline || "",
      aboutText: row.about_text || "",
      ctaText: row.cta_text || "",
      themeColor: row.theme_color || "#16a34a",
      services: effectiveServices,
      published: row.published === true,
      industry: industryProfile.key,
      industryLabel: industryProfile.label,
      companyProfile: profile,
    },
  });
}

export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));

  const profile = await getCompanyProfileByTenant({
    tenantId: access.tenantDbId,
  });

  const row = await findOrCreateWebsite(access.tenantDbId, profile);

  const patch = {};
  if (typeof body.headline === "string") patch.headline = body.headline.slice(0, 200);
  if (typeof body.subheadline === "string") patch.subheadline = body.subheadline.slice(0, 300);
  if (typeof body.aboutText === "string") patch.about_text = body.aboutText.slice(0, 2000);
  if (typeof body.ctaText === "string") patch.cta_text = body.ctaText.slice(0, 100);
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
  if (typeof body.published === "boolean") patch.published = body.published;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) {
    console.error("[api/website-builder][PATCH] DB error", error);
    return Response.json({ success: false, error: "Unable to save website" }, { status: 500 });
  }

  return Response.json({
    success: true,
    data: {
      id: data.id,
      slug: data.slug,
      headline: data.headline || "",
      subheadline: data.subheadline || "",
      aboutText: data.about_text || "",
      ctaText: data.cta_text || "",
      themeColor: data.theme_color || "#16a34a",
      services: Array.isArray(data.services) ? data.services : [],
      published: data.published === true,
    },
  });
}
