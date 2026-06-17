import "server-only";

import {
  getCompanyProfileByTenant,
  withDefaultCompanyProfile,
} from "@/lib/company-profile-store";
import {
  getWebsiteBuilderPack,
  resolveWebsiteIndustryForWebsite,
} from "@/lib/website-builder-industry";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Shared tenant + website context for image routes (one DB round-trip per request). */
export async function resolveWebsiteImageContext(tenantDbId) {
  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({ tenantId: tenantDbId }),
    tenantDbId,
  );
  const { data: websiteRow } = await supabaseAdmin
    .from("contractor_websites")
    .select("slug, site_meta")
    .eq("tenant_id", tenantDbId)
    .maybeSingle();

  const pack = getWebsiteBuilderPack(
    resolveWebsiteIndustryForWebsite(profile, websiteRow?.site_meta),
  );
  const websiteSlug = String(websiteRow?.slug || "draft").trim();
  const companyName = String(
    profile?.publicDisplayName || profile?.companyName || "",
  ).trim();

  return { pack, websiteSlug, companyName };
}
