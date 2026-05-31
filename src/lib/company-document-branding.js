import "server-only";

import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import {
  getTenantPublishedWebsiteUrl,
  resolveDocumentWebsiteUrl,
} from "@/lib/company-public-website-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

function sanitizeLogoUrl(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("https://") || raw.startsWith("data:image/")) return raw;
  return "";
}

function mapLogoPlacement(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "top-right" || v === "top_right") return "top_right";
  if (v === "centered" || v === "top_center" || v === "top-center") return "top_center";
  if (v === "hidden") return "top_left";
  return "top_left";
}

async function getTenantBusinessEmail(tenantId) {
  const id = String(tenantId || "").trim();
  if (!id) return "";

  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("tenant_id", id)
      .not("email", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error || !Array.isArray(data) || !data[0]?.email) return "";
    return String(data[0].email).trim().toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Branding bundle for contractor PDFs and emails (logo, name, contact, site).
 */
export async function getCompanyDocumentBranding(tenantId) {
  const fallback = {
    companyName: "",
    logoUrl: "",
    logoPlacement: "top_left",
    phone: "",
    websiteUrl: resolveDocumentWebsiteUrl({}),
    email: "",
    businessAddress: "",
    legalFooter: "",
    publishedSiteUrl: "",
  };

  const id = String(tenantId || "").trim();
  if (!id) return fallback;

  const [profile, email, publishedSiteUrl] = await Promise.all([
    getCompanyProfileByTenant({ tenantId: id }).catch(() => null),
    getTenantBusinessEmail(id),
    getTenantPublishedWebsiteUrl(id),
  ]);

  if (!profile) {
    return {
      ...fallback,
      email,
      publishedSiteUrl,
      websiteUrl: resolveDocumentWebsiteUrl({ publishedSiteUrl }),
    };
  }

  const companyName =
    String(profile.publicDisplayName || profile.companyName || "").trim();

  return {
    companyName,
    logoUrl:
      sanitizeLogoUrl(profile.logoUrl) ||
      sanitizeLogoUrl(profile.logoDataUrl),
    logoPlacement: mapLogoPlacement(profile.logoPlacement),
    phone: String(profile.phone || "").trim(),
    websiteUrl: resolveDocumentWebsiteUrl({
      profileWebsiteUrl: profile.websiteUrl,
      publishedSiteUrl,
    }),
    email,
    businessAddress: String(profile.businessAddress || "").trim(),
    legalFooter: String(profile.legalFooter || "").trim(),
    publishedSiteUrl,
  };
}
