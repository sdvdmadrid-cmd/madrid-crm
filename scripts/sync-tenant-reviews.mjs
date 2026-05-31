#!/usr/bin/env node
/**
 * Connect Google/Yelp sources for a tenant and sync real reviews (uses service role).
 *
 * Usage: node scripts/sync-tenant-reviews.mjs <tenant-uuid>
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";
import { buildExternalId, normalizeSyncedReviewRow } from "../src/lib/reputation-sync/shared.js";

const tenantId = String(process.argv[2] || "").trim();
if (!tenantId) {
  console.error("Usage: node scripts/sync-tenant-reviews.mjs <tenant-uuid>");
  process.exit(1);
}

loadEnvLocal(process.cwd());

function mergeEnvFile(filePath, { onlyKeys } = {}) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (onlyKeys && !onlyKeys.includes(m[1])) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v) process.env[m[1]] = v;
  }
}

const API_KEYS = ["GOOGLE_PLACES_API_KEY", "YELP_FUSION_API_KEY"];
mergeEnvFile(path.join(process.cwd(), ".env.vercel.prod"), { onlyKeys: API_KEYS });
// Vercel CLI injects production env before node; never let empty .env.local wipe them.
for (const key of API_KEYS) {
  const fromCli = process.env[key];
  if (fromCli) continue;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findGooglePlaceId(companyName) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { placeId: "", error: "GOOGLE_PLACES_API_KEY missing" };

  for (const query of [
    `${companyName} Glendale Heights IL`,
    `${companyName} Lombard IL`,
    companyName,
  ]) {
    const params = new URLSearchParams({ query, key });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) continue;
    const hit =
      data.results.find((r) => String(r.name || "").toLowerCase().includes("madrid")) ||
      data.results[0];
    return {
      placeId: hit.place_id,
      name: hit.name,
      address: hit.formatted_address,
      profileUrl: `https://www.google.com/maps/place/?q=place_id:${hit.place_id}`,
    };
  }
  return { placeId: "", error: "not found" };
}

async function fetchGoogleReviews(placeId) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "reviews,rating,user_ratings_total,url,name",
    key,
  });
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${params}`,
    { signal: AbortSignal.timeout(8000) },
  );
  const data = await res.json();
  if (data.status !== "OK") return { ok: false, error: data.status, reviews: [] };
  return {
    ok: true,
    profileUrl: data.result?.url || "",
    reviews: (data.result?.reviews || []).map((r) => ({
      externalId: `time-${r.time}`,
      authorName: r.author_name,
      rating: r.rating,
      reviewText: r.text,
      reviewDate: r.time ? new Date(r.time * 1000).toISOString() : null,
      photoUrl: r.profile_photo_url || "",
      sourceUrl: data.result?.url || "",
    })),
  };
}

function parseYelpId(url) {
  const m = String(url || "").match(/yelp\.com\/biz\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

async function fetchYelpReviews(businessId) {
  const apiKey = process.env.YELP_FUSION_API_KEY;
  if (!apiKey) return { ok: false, error: "YELP_FUSION_API_KEY missing", reviews: [] };
  const res = await fetch(
    `https://api.yelp.com/v3/businesses/${encodeURIComponent(businessId)}/reviews`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error?.description || res.status, reviews: [] };
  const profileUrl = `https://www.yelp.com/biz/${businessId}`;
  return {
    ok: true,
    profileUrl,
    reviews: (data.reviews || []).map((r) => ({
      externalId: r.id,
      authorName: r.user?.name,
      rating: r.rating,
      reviewText: r.text,
      reviewDate: r.time_created,
      photoUrl: r.user?.image_url || "",
      sourceUrl: profileUrl,
    })),
  };
}

async function upsertReviews(platform, items) {
  const { data: existing } = await supabase
    .from("contractor_reviews")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("platform", platform);

  const byExt = new Map();
  for (const row of existing || []) {
    if (row.metadata?.externalId) byExt.set(row.metadata.externalId, row.id);
  }

  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const row = normalizeSyncedReviewRow({
      tenantId,
      platform,
      ...item,
    });
    if (!row) continue;

    const ext = row.metadata.externalId;
    const existingId = byExt.get(ext);
    if (existingId) {
      const { error } = await supabase
        .from("contractor_reviews")
        .update({
          author_name: row.author_name,
          rating: row.rating,
          review_text: row.review_text,
          review_date: row.review_date,
          photo_url: row.photo_url,
          source_url: row.source_url,
          verified: true,
          show_on_website: true,
          hidden: false,
          metadata: row.metadata,
          updated_at: row.updated_at,
        })
        .eq("id", existingId);
      if (error) throw error;
      updated += 1;
    } else {
      const { data, error } = await supabase
        .from("contractor_reviews")
        .insert({ ...row, created_at: row.updated_at })
        .select("id")
        .single();
      if (error) throw error;
      byExt.set(ext, data.id);
      inserted += 1;
    }
  }

  return { inserted, updated };
}

async function main() {
  const { data: cp } = await supabase
    .from("company_profiles")
    .select("company_name, website_url")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const companyName = cp?.company_name || "madrids landscaping corp";
  console.log("[sync] Tenant:", tenantId, "—", companyName);

  const googleMeta = await findGooglePlaceId(companyName);
  let yelpUrl = "";

  if (process.env.YELP_FUSION_API_KEY) {
    const params = new URLSearchParams({
      term: companyName,
      location: "Glendale Heights, IL",
      limit: "5",
    });
    const res = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
      headers: { Authorization: `Bearer ${process.env.YELP_FUSION_API_KEY}` },
    });
    const data = await res.json();
    const biz = data.businesses?.find((b) =>
      String(b.name || "").toLowerCase().includes("madrid"),
    );
    if (biz?.url) yelpUrl = biz.url;
  }

  const now = new Date().toISOString();
  await supabase.from("contractor_review_sources").upsert(
    {
      tenant_id: tenantId,
      google_place_id: googleMeta.placeId || null,
      google_profile_url: googleMeta.profileUrl || null,
      yelp_business_id: parseYelpId(yelpUrl) || null,
      yelp_profile_url: yelpUrl || null,
      updated_at: now,
    },
    { onConflict: "tenant_id" },
  );

  const results = {};

  if (googleMeta.placeId) {
    const g = await fetchGoogleReviews(googleMeta.placeId);
    if (g.ok) {
      results.google = await upsertReviews(
        "google",
        g.reviews.filter((r) => r.reviewText),
      );
      results.google.count = g.reviews.length;
    } else {
      results.google = { error: g.error };
    }
  } else {
    results.google = { error: googleMeta.error || "no place id" };
  }

  const yelpId = parseYelpId(yelpUrl);
  if (yelpId) {
    const y = await fetchYelpReviews(yelpId);
    if (y.ok) {
      results.yelp = await upsertReviews(
        "yelp",
        y.reviews.filter((r) => r.reviewText),
      );
      results.yelp.count = y.reviews.length;
    } else {
      results.yelp = { error: y.error };
    }
  } else {
    results.yelp = {
      error: process.env.YELP_FUSION_API_KEY
        ? "no yelp business found"
        : "YELP_FUSION_API_KEY not configured",
    };
  }

  await supabase
    .from("contractor_review_sources")
    .update({ last_sync_at: now, last_sync_status: results, updated_at: now })
    .eq("tenant_id", tenantId);

  console.log("[sync] Done:", JSON.stringify(results, null, 2));

  const { count } = await supabase
    .from("contractor_reviews")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .contains("metadata", { syncSource: "api" });

  console.log("[sync] Total API reviews:", count ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
