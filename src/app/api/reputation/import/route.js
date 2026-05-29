import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  detectPlatformFromUrl,
  normalizeReviewPlatform,
  serializeReview,
} from "@/lib/reputation-store";

/**
 * Import reviews from pasted text or structured JSON (private dashboard only).
 * URL sync fetches metadata when possible; full OAuth sync is future work.
 */
export async function POST(request) {
  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const sourceUrl = String(body.sourceUrl || "").trim().slice(0, 500);
    const platform =
      normalizeReviewPlatform(body.platform) !== "other"
        ? normalizeReviewPlatform(body.platform)
        : detectPlatformFromUrl(sourceUrl);

    const items = Array.isArray(body.reviews) ? body.reviews : [];
    if (!items.length && body.reviewText) {
      items.push({
        authorName: body.authorName,
        rating: body.rating,
        reviewText: body.reviewText,
        reviewDate: body.reviewDate,
        photoUrl: body.photoUrl,
        serviceType: body.serviceType,
      });
    }

    if (!items.length) {
      return privateJson(
        { success: false, error: "Add at least one review or paste review details" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const rows = items
      .map((item) => ({
        tenant_id: auth.ctx.tenantDbId,
        platform,
        source_url: sourceUrl,
        author_name: String(item.authorName || "Customer").trim().slice(0, 120) || "Customer",
        rating:
          item.rating != null ? Math.min(5, Math.max(0, Number(item.rating))) : null,
        review_text: String(item.reviewText || "").trim().slice(0, 2000),
        review_date: item.reviewDate || now,
        photo_url: String(item.photoUrl || "").trim().slice(0, 500),
        video_url: String(item.videoUrl || "").trim().slice(0, 500),
        service_type: String(item.serviceType || "").trim().slice(0, 120),
        verified: false,
        pinned: false,
        hidden: false,
        show_on_website: false,
        metadata: {
          importedAt: now,
          importMode: body.mode || "paste",
          syncSource: "manual",
        },
        created_at: now,
        updated_at: now,
      }))
      .filter((row) => row.review_text);

    if (!rows.length) {
      return privateJson({ success: false, error: "No valid reviews to import" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("contractor_reviews")
      .insert(rows)
      .select("*");

    if (error) throw error;

    return privateJson({
      success: true,
      data: (data || []).map(serializeReview),
      imported: rows.length,
    });
  } catch (error) {
    console.error("[api/reputation/import][POST]", error);
    return privateJson({ success: false, error: "Import failed" }, { status: 500 });
  }
}
