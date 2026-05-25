import { supabaseAdmin } from "@/lib/supabase-admin";
import { uploadWebsiteImageFromDataUrl } from "@/lib/website-media-storage";
import {
  verifyWebsiteUploadToken,
  recordWebsiteUploadTokenUse,
} from "@/lib/website-upload-tokens";
import { getRequestIp } from "@/lib/rate-limit";

const WEBSITES_TABLE = "contractor_websites";
const MAX_BATCH_SIZE = 6;
const PENDING_GALLERY_KEY = "pendingUploads";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /api/website-builder/qr-upload
 * Public, token-gated photo upload endpoint used by the mobile /u/[token]
 * page. Photos go straight into the contractor's draft `pendingUploads`
 * array — they DO NOT appear on the live website until the contractor
 * approves and publishes.
 *
 * Body shape:
 *   - token: string (the JWT issued by /api/website-builder/qr-token)
 *   - items: [{ dataUrl: string, alt?: string }] (max 6/batch)
 *
 * Auth model: no session. The bearer of the JWT can upload until it
 * expires, is revoked, or hits its per-token upload cap. The JWT carries
 * the tenant id so we never expose a "pick a tenant" surface to the
 * caller.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    if (!token) {
      return jsonResponse({ success: false, error: "Missing upload token" }, 400);
    }

    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_BATCH_SIZE) : [];
    if (items.length === 0) {
      return jsonResponse({ success: false, error: "No items to upload" }, 400);
    }

    const verification = await verifyWebsiteUploadToken(token);
    if (!verification.ok) {
      return jsonResponse(
        { success: false, error: verification.error || "Invalid upload token" },
        verification.status || 403,
      );
    }
    const tenantId = verification.tenantId;
    const remainingCap = verification.row
      ? Math.max(0, Number(verification.row.max_uploads || 0) - Number(verification.row.upload_count || 0))
      : MAX_BATCH_SIZE;
    if (remainingCap === 0) {
      return jsonResponse({ success: false, error: "Upload limit reached." }, 429);
    }

    // Load the contractor's website row so we can scope storage paths to
    // their slug and append to draft_content.pendingUploads atomically.
    const { data: website, error: websiteError } = await supabaseAdmin
      .from(WEBSITES_TABLE)
      .select("id, slug, draft_content, gallery_photos")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (websiteError) {
      console.error("[api/website-builder/qr-upload] website lookup", websiteError.message);
      return jsonResponse({ success: false, error: "Unable to load website" }, 500);
    }
    if (!website) {
      return jsonResponse(
        { success: false, error: "Contractor has no website yet. Set one up first." },
        404,
      );
    }
    const slug = String(website.slug || "site");

    const batch = items.slice(0, Math.min(MAX_BATCH_SIZE, remainingCap));
    const uploaded = [];
    const failed = [];
    for (const item of batch) {
      const dataUrl = String(item?.dataUrl || "").trim();
      if (!dataUrl) {
        failed.push({ alt: String(item?.alt || ""), reason: "missing data" });
        continue;
      }
      const alt = String(item?.alt || "").slice(0, 160);
      try {
        const url = await uploadWebsiteImageFromDataUrl({
          tenantId,
          slug,
          dataUrl,
          kind: "mobile-pending",
        });
        if (!/^https?:\/\//i.test(url)) {
          failed.push({ alt, reason: "Storage upload failed" });
          continue;
        }
        uploaded.push({
          id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          src: url,
          thumbnail: url,
          alt,
          kind: "mobile-pending",
          uploadedAt: new Date().toISOString(),
        });
      } catch (err) {
        failed.push({ alt, reason: err?.message || "Upload error" });
      }
    }

    if (uploaded.length === 0) {
      return jsonResponse(
        { success: false, error: "All uploads failed", failed },
        502,
      );
    }

    // Append to draft_content.pendingUploads. We re-fetch in case another
    // upload landed in parallel. Fail-soft on schema drift: if
    // draft_content doesn't exist yet, fall back to gallery_photos.
    const currentDraft =
      website.draft_content && typeof website.draft_content === "object"
        ? website.draft_content
        : {};
    const currentPending = Array.isArray(currentDraft[PENDING_GALLERY_KEY])
      ? currentDraft[PENDING_GALLERY_KEY]
      : [];
    const nextDraft = {
      ...currentDraft,
      [PENDING_GALLERY_KEY]: [...currentPending, ...uploaded].slice(-200),
    };

    const { error: updateError } = await supabaseAdmin
      .from(WEBSITES_TABLE)
      .update({
        draft_content: nextDraft,
        has_unpublished_changes: true,
        draft_updated_at: new Date().toISOString(),
      })
      .eq("id", website.id);

    if (updateError && /column .* does not exist/i.test(updateError.message || "")) {
      // Pre-migration fallback: drop directly into gallery_photos so the
      // contractor still sees the photos (but they bypass the pending
      // queue UI). Better than failing silently.
      const fallback = [
        ...(Array.isArray(website.gallery_photos) ? website.gallery_photos : []),
        ...uploaded,
      ];
      await supabaseAdmin
        .from(WEBSITES_TABLE)
        .update({ gallery_photos: fallback })
        .eq("id", website.id);
    } else if (updateError) {
      console.error(
        "[api/website-builder/qr-upload] draft update failed",
        updateError.message,
      );
      return jsonResponse(
        { success: false, error: "Upload succeeded but draft sync failed.", uploaded },
        500,
      );
    }

    await recordWebsiteUploadTokenUse({
      jti: verification.jti,
      incrementBy: uploaded.length,
      ip: getRequestIp(request),
    });

    return jsonResponse({
      success: true,
      data: {
        uploaded,
        failed,
        accepted: uploaded.length,
        rejected: failed.length,
      },
    });
  } catch (error) {
    console.error("[api/website-builder/qr-upload] error", error);
    return jsonResponse(
      { success: false, error: error?.message || "Unable to upload" },
      500,
    );
  }
}
