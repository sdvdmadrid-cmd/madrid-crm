import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { serializeReview } from "@/lib/reputation-store";
import { normalizeSyncedReviewRow } from "@/lib/reputation-sync/shared";

export async function upsertSyncedReviews(tenantId, platform, items = []) {
  const rows = items
    .map((item) =>
      normalizeSyncedReviewRow({
        tenantId,
        platform,
        ...item,
      }),
    )
    .filter(Boolean);

  if (!rows.length) {
    return { inserted: 0, updated: 0, skipped: 0, reviews: [] };
  }

  const { data: existing, error: listError } = await supabaseAdmin
    .from("contractor_reviews")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("platform", platform);

  if (listError) throw listError;

  const byExternal = new Map();
  for (const row of existing || []) {
    const ext = row.metadata?.externalId;
    if (ext) byExternal.set(ext, row.id);
  }

  let inserted = 0;
  let updated = 0;
  const saved = [];

  for (const row of rows) {
    const ext = row.metadata.externalId;
    const existingId = byExternal.get(ext);

    if (existingId) {
      const { data, error } = await supabaseAdmin
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
        .eq("id", existingId)
        .select("*")
        .single();

      if (error) throw error;
      updated += 1;
      saved.push(serializeReview(data));
    } else {
      const { data, error } = await supabaseAdmin
        .from("contractor_reviews")
        .insert({ ...row, created_at: row.updated_at })
        .select("*")
        .single();

      if (error) throw error;
      inserted += 1;
      byExternal.set(ext, data.id);
      saved.push(serializeReview(data));
    }
  }

  return {
    inserted,
    updated,
    skipped: Math.max(0, items.length - rows.length),
    reviews: saved,
  };
}
