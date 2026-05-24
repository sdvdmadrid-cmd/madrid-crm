import { supabaseAdmin } from "@/lib/supabase-admin";
import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { isSuperAdminRole } from "@/lib/access-control";
import { scopeByTenant } from "@/lib/tenant-scope";
import { normalizeReviewPlatform, serializeReview } from "@/lib/reputation-store";

export async function PATCH(request, { params }) {
  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json();
    const patch = { updated_at: new Date().toISOString() };

    if (body.platform != null) patch.platform = normalizeReviewPlatform(body.platform);
    if (body.sourceUrl != null) patch.source_url = String(body.sourceUrl).slice(0, 500);
    if (body.authorName != null) patch.author_name = String(body.authorName).slice(0, 120);
    if (body.rating != null) patch.rating = Math.min(5, Math.max(0, Number(body.rating)));
    if (body.reviewText != null) patch.review_text = String(body.reviewText).slice(0, 2000);
    if (body.reviewDate != null) patch.review_date = body.reviewDate;
    if (body.photoUrl != null) patch.photo_url = String(body.photoUrl).slice(0, 500);
    if (body.videoUrl != null) patch.video_url = String(body.videoUrl).slice(0, 500);
    if (body.serviceType != null) patch.service_type = String(body.serviceType).slice(0, 120);
    if (body.verified != null) patch.verified = body.verified === true;
    if (body.pinned != null) patch.pinned = body.pinned === true;
    if (body.hidden != null) patch.hidden = body.hidden === true;
    if (body.showOnWebsite != null) patch.show_on_website = body.showOnWebsite !== false;

    let query = supabaseAdmin
      .from("contractor_reviews")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (!isSuperAdminRole(auth.ctx.role)) {
      query = scopeByTenant(query, { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role });
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data) {
      return privateJson({ success: false, error: "Review not found" }, { status: 404 });
    }

    return privateJson({ success: true, data: serializeReview(data) });
  } catch (error) {
    console.error("[api/reputation/reviews][PATCH]", error);
    return privateJson({ success: false, error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    let query = supabaseAdmin.from("contractor_reviews").delete().eq("id", id);
    if (!isSuperAdminRole(auth.ctx.role)) {
      query = scopeByTenant(query, { tenantDbId: auth.ctx.tenantDbId, role: auth.ctx.role });
    }
    const { error } = await query;
    if (error) throw error;
    return privateJson({ success: true });
  } catch (error) {
    console.error("[api/reputation/reviews][DELETE]", error);
    return privateJson({ success: false, error: "Delete failed" }, { status: 500 });
  }
}
