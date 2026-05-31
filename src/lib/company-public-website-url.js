import "server-only";

import { buildPublicWebsiteUrl } from "@/lib/public-website-routing";
import { supabaseAdmin } from "@/lib/supabase-admin";

function appOrigin() {
  return String(
    process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
  )
    .trim()
    .replace(/\/$/, "");
}

/**
 * Published FieldBase site for this tenant (e.g. fieldbaseapp.net/sites/acme-plumbing).
 */
export async function getTenantPublishedWebsiteUrl(tenantId) {
  const id = String(tenantId || "").trim();
  if (!id) return "";

  try {
    const { data, error } = await supabaseAdmin
      .from("contractor_websites")
      .select("slug")
      .eq("tenant_id", id)
      .maybeSingle();

    if (error || !data?.slug) return "";
    return buildPublicWebsiteUrl(data.slug, appOrigin());
  } catch {
    return "";
  }
}

/**
 * Website shown on estimates, invoices, and PDFs:
 * custom URL from profile → tenant FieldBase site → platform home.
 */
export function resolveDocumentWebsiteUrl({
  profileWebsiteUrl = "",
  publishedSiteUrl = "",
} = {}) {
  const manual = String(profileWebsiteUrl || "").trim();
  if (manual) {
    return /^https?:\/\//i.test(manual) ? manual : `https://${manual}`;
  }

  const published = String(publishedSiteUrl || "").trim();
  if (published) return published;

  return appOrigin();
}
