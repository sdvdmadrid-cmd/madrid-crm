import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { isMissingColumnError } from "@/lib/company-profile-store";
import { parsePublicWebsiteSlug } from "@/lib/public-website-routing";
import { assemblePublicWebsiteFromRow } from "@/lib/public-website";

export { parsePublicWebsiteSlug } from "@/lib/public-website-routing";

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

const PUBLIC_WEBSITE_SELECT_LEGACY = PUBLIC_WEBSITE_SELECT.replace(",site_meta", "");

async function fetchWebsiteRowBySlug(slug, { publishedOnly = false } = {}) {
  let query = supabaseAdmin.from("contractor_websites").select(PUBLIC_WEBSITE_SELECT).eq("slug", slug);
  if (publishedOnly) {
    query = query.eq("published", true);
  }

  let { data, error } = await query.maybeSingle();

  if (error && isMissingColumnError(error, "site_meta")) {
    let legacyQuery = supabaseAdmin
      .from("contractor_websites")
      .select(PUBLIC_WEBSITE_SELECT_LEGACY)
      .eq("slug", slug);
    if (publishedOnly) {
      legacyQuery = legacyQuery.eq("published", true);
    }
    ({ data, error } = await legacyQuery.maybeSingle());
    if (data && !data.site_meta) {
      data.site_meta = {};
    }
  }

  if (error) {
    console.error("[public-website-lead] fetchWebsiteRowBySlug", { slug, publishedOnly, error });
    return null;
  }

  return data;
}

export const LEAD_SUBMISSION_ERRORS = {
  invalid_slug: {
    status: 400,
    message:
      "This request link is invalid. Please refresh the page or use the contractor’s main website link.",
  },
  not_found: {
    status: 404,
    message:
      "We couldn’t match this page to an active contractor website. Please refresh and try again, or call the contractor directly.",
  },
  unpublished: {
    status: 503,
    message:
      "Online quote requests aren’t active on this page yet. Please call the contractor or try again after they publish their site.",
  },
  system: {
    status: 503,
    message: "We couldn’t send your request right now. Please try again in a moment or call the contractor.",
  },
};

/**
 * Resolve a contractor website for public lead submission (canonical slug + published check).
 */
export async function resolveWebsiteForLeadSubmission(slugInput) {
  const slug = parsePublicWebsiteSlug(slugInput);
  if (!slug) {
    return { ok: false, reason: "invalid_slug", slug: "", ...LEAD_SUBMISSION_ERRORS.invalid_slug };
  }

  const row = await fetchWebsiteRowBySlug(slug, { publishedOnly: false });
  if (!row?.tenant_id) {
    return { ok: false, reason: "not_found", slug, ...LEAD_SUBMISSION_ERRORS.not_found };
  }

  if (row.published !== true) {
    return {
      ok: false,
      reason: "unpublished",
      slug: row.slug,
      ...LEAD_SUBMISSION_ERRORS.unpublished,
    };
  }

  try {
    const website = await assemblePublicWebsiteFromRow(row);
    if (!website) {
      return { ok: false, reason: "system", slug: row.slug, ...LEAD_SUBMISSION_ERRORS.system };
    }
    return { ok: true, slug: row.slug, website };
  } catch (error) {
    console.error("[public-website-lead] assemble failed", error);
    return { ok: false, reason: "system", slug: row.slug, ...LEAD_SUBMISSION_ERRORS.system };
  }
}
