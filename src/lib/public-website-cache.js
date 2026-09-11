import "server-only";

import { unstable_cache } from "next/cache";
import { getPublicWebsiteBySlug } from "@/lib/public-website";
import { normalizeWebsiteSlug } from "@/lib/public-website-routing";
import { getPublicReviewsBySlug } from "@/lib/reputation-store";

export const PUBLIC_SITE_REVALIDATE_SECONDS = 300;

export function publicSiteCacheTag(slug) {
  const normalized = normalizeWebsiteSlug(slug);
  return normalized ? `public-site:${normalized}` : "";
}

/**
 * Cached public website payload for ISR pages.
 * Invalidated on publish/unpublish via revalidateTag(publicSiteCacheTag(slug)).
 */
export function getCachedPublicWebsiteBySlug(slug) {
  const normalized = normalizeWebsiteSlug(slug);
  if (!normalized) return Promise.resolve(null);

  return unstable_cache(
    async () => getPublicWebsiteBySlug(normalized),
    ["public-website-by-slug", normalized],
    {
      revalidate: PUBLIC_SITE_REVALIDATE_SECONDS,
      tags: [publicSiteCacheTag(normalized)],
    },
  )();
}

export function getCachedPublicReviewsBySlug(slug) {
  const normalized = normalizeWebsiteSlug(slug);
  if (!normalized) {
    return Promise.resolve({ reviews: [], stats: null });
  }

  return unstable_cache(
    async () => getPublicReviewsBySlug(normalized),
    ["public-reviews-by-slug", normalized],
    {
      revalidate: PUBLIC_SITE_REVALIDATE_SECONDS,
      tags: [publicSiteCacheTag(normalized)],
    },
  )();
}
