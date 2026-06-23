import "server-only";

import {
  sanitizeLastSyncStatus,
  sanitizeSyncPlatformResult,
} from "@/lib/reputation-sync/shared";

export {
  sanitizeLastSyncStatus,
  sanitizeReputationSyncError,
  sanitizeSyncPlatformResult,
} from "@/lib/reputation-sync/shared";

/** Whether server env is configured for each review sync provider (never expose key names). */
export function getReputationSyncAvailability() {
  const google = Boolean(String(process.env.GOOGLE_PLACES_API_KEY || "").trim());
  const yelp = Boolean(String(process.env.YELP_FUSION_API_KEY || "").trim());
  return {
    google,
    yelp,
    any: google || yelp,
    all: google && yelp,
  };
}

export function serializeReviewSourcesForClient(row) {
  if (!row) return null;
  const availability = getReputationSyncAvailability();
  return {
    tenantId: row.tenant_id,
    googlePlaceId: row.google_place_id || "",
    googleProfileUrl: row.google_profile_url || "",
    yelpBusinessId: row.yelp_business_id || "",
    yelpProfileUrl: row.yelp_profile_url || "",
    lastSyncAt: row.last_sync_at || null,
    lastSyncStatus: sanitizeLastSyncStatus(row.last_sync_status || {}),
    updatedAt: row.updated_at,
    syncAvailability: availability,
  };
}
