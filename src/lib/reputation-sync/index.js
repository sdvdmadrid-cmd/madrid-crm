import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { fetchGooglePlaceReviews } from "@/lib/reputation-sync/google-places";
import {
  fetchYelpBusinessReviews,
  parseYelpBusinessIdFromUrl,
  resolveYelpBusinessId,
} from "@/lib/reputation-sync/yelp";
import { upsertSyncedReviews } from "@/lib/reputation-sync/upsert";

export function serializeReviewSource(row) {
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    googlePlaceId: row.google_place_id || "",
    googleProfileUrl: row.google_profile_url || "",
    yelpBusinessId: row.yelp_business_id || "",
    yelpProfileUrl: row.yelp_profile_url || "",
    lastSyncAt: row.last_sync_at || null,
    lastSyncStatus: row.last_sync_status || {},
    updatedAt: row.updated_at,
  };
}

export async function getReviewSources(tenantId) {
  const { data, error } = await supabaseAdmin
    .from("contractor_review_sources")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
  return serializeReviewSource(data);
}

export async function upsertReviewSources(tenantId, patch = {}) {
  const now = new Date().toISOString();
  const row = {
    tenant_id: tenantId,
    google_place_id: String(patch.googlePlaceId || "").trim().slice(0, 200) || null,
    google_profile_url: String(patch.googleProfileUrl || "").trim().slice(0, 500) || null,
    yelp_business_id: String(patch.yelpBusinessId || "").trim().slice(0, 200) || null,
    yelp_profile_url: String(patch.yelpProfileUrl || "").trim().slice(0, 500) || null,
    updated_at: now,
  };

  if (patch.yelpProfileUrl && !row.yelp_business_id) {
    row.yelp_business_id = parseYelpBusinessIdFromUrl(patch.yelpProfileUrl) || null;
  }

  const { data, error } = await supabaseAdmin
    .from("contractor_review_sources")
    .upsert(row, { onConflict: "tenant_id" })
    .select("*")
    .single();

  if (error) throw error;
  return serializeReviewSource(data);
}

async function updateSyncStatus(tenantId, platform, result) {
  const sources = (await getReviewSources(tenantId)) || { lastSyncStatus: {} };
  const status = { ...(sources.lastSyncStatus || {}), [platform]: result };
  const now = new Date().toISOString();

  await supabaseAdmin
    .from("contractor_review_sources")
    .upsert(
      {
        tenant_id: tenantId,
        last_sync_at: now,
        last_sync_status: status,
        updated_at: now,
      },
      { onConflict: "tenant_id" },
    );
}

export async function syncTenantReviewsFromSources(tenantId, { platforms } = {}) {
  const wantGoogle = !platforms?.length || platforms.includes("google");
  const wantYelp = !platforms?.length || platforms.includes("yelp");

  let sources = await getReviewSources(tenantId);
  const profile = await getCompanyProfileByTenant({ tenantId }).catch(() => null);
  const companyName =
    profile?.companyName || profile?.businessName || profile?.name || "";

  const results = { google: null, yelp: null, totals: { inserted: 0, updated: 0 } };

  if (wantGoogle && sources?.googlePlaceId) {
    const fetched = await fetchGooglePlaceReviews(sources.googlePlaceId);
    if (fetched.ok) {
      const upsert = await upsertSyncedReviews(tenantId, "google", fetched.reviews);
      results.google = { ok: true, count: fetched.reviews.length, ...upsert };
      results.totals.inserted += upsert.inserted;
      results.totals.updated += upsert.updated;

      if (fetched.profileUrl) {
        sources = await upsertReviewSources(tenantId, {
          googlePlaceId: sources.googlePlaceId,
          googleProfileUrl: fetched.profileUrl,
          yelpBusinessId: sources?.yelpBusinessId,
          yelpProfileUrl: sources?.yelpProfileUrl,
        });
      }
    } else {
      results.google = { ok: false, error: fetched.error };
    }
    await updateSyncStatus(tenantId, "google", results.google);
  } else if (wantGoogle) {
    results.google = { ok: false, error: "Connect a Google business (Place ID) first" };
  }

  if (wantYelp) {
    let yelpId = sources?.yelpBusinessId || "";
    if (!yelpId && sources?.yelpProfileUrl) {
      yelpId = parseYelpBusinessIdFromUrl(sources.yelpProfileUrl);
    }
    if (!yelpId) {
      const resolved = await resolveYelpBusinessId({
        name: companyName,
        phone: profile?.phone,
        address: profile?.businessAddress || "",
      });
      if (resolved.ok) {
        yelpId = resolved.businessId;
        sources = await upsertReviewSources(tenantId, {
          googlePlaceId: sources?.googlePlaceId,
          googleProfileUrl: sources?.googleProfileUrl,
          yelpBusinessId: yelpId,
          yelpProfileUrl: resolved.profileUrl,
        });
      }
    }

    if (yelpId) {
      const fetched = await fetchYelpBusinessReviews(yelpId);
      if (fetched.ok) {
        const upsert = await upsertSyncedReviews(tenantId, "yelp", fetched.reviews);
        results.yelp = { ok: true, count: fetched.reviews.length, ...upsert };
        results.totals.inserted += upsert.inserted;
        results.totals.updated += upsert.updated;
      } else {
        results.yelp = { ok: false, error: fetched.error };
      }
    } else {
      results.yelp = {
        ok: false,
        error: "Connect Yelp — save your Yelp page URL or ensure company name/address is set",
      };
    }
    await updateSyncStatus(tenantId, "yelp", results.yelp);
  }

  return { sources: await getReviewSources(tenantId), results };
}
