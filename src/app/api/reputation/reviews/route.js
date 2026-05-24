import { supabaseAdmin } from "@/lib/supabase-admin";
import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { isSuperAdminRole } from "@/lib/access-control";
import { scopeByTenant } from "@/lib/tenant-scope";
import {
  listTenantReviews,
  normalizeReviewPlatform,
  serializeReview,
} from "@/lib/reputation-store";

export async function GET(request) {
  const auth = await requirePrivateTenantApi(request);
  if (!auth.ok) return auth.response;

  try {
    const reviews = await listTenantReviews(auth.ctx.tenantDbId, { includeHidden: true });
    return privateJson({ success: true, data: reviews });
  } catch (error) {
    console.error("[api/reputation/reviews][GET]", error);
    return privateJson({ success: false, error: "Unable to load reviews" }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const now = new Date().toISOString();
    const row = {
      tenant_id: auth.ctx.tenantDbId,
      platform: normalizeReviewPlatform(body.platform),
      source_url: String(body.sourceUrl || "").trim().slice(0, 500),
      author_name: String(body.authorName || "Customer").trim().slice(0, 120) || "Customer",
      rating: body.rating != null ? Math.min(5, Math.max(0, Number(body.rating))) : null,
      review_text: String(body.reviewText || "").trim().slice(0, 2000),
      review_date: body.reviewDate || now,
      photo_url: String(body.photoUrl || "").trim().slice(0, 500),
      video_url: String(body.videoUrl || "").trim().slice(0, 500),
      service_type: String(body.serviceType || "").trim().slice(0, 120),
      verified: body.verified === true,
      pinned: body.pinned === true,
      hidden: body.hidden === true,
      show_on_website: body.showOnWebsite !== false,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      created_at: now,
      updated_at: now,
    };

    if (!row.review_text) {
      return privateJson({ success: false, error: "Review text is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("contractor_reviews")
      .insert(row)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return privateJson({ success: true, data: serializeReview(data) });
  } catch (error) {
    console.error("[api/reputation/reviews][POST]", error);
    return privateJson({ success: false, error: "Unable to save review" }, { status: 500 });
  }
}
