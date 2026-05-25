import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { normalizeGalleryPhoto } from "@/lib/website-gallery";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const WEBSITES_TABLE = "contractor_websites";
const PENDING_KEY = "pendingUploads";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function loadWebsite(tenantId) {
  const { data, error } = await supabaseAdmin
    .from(WEBSITES_TABLE)
    .select("id, slug, draft_content, gallery_photos")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data || null;
}

/**
 * GET /api/website-builder/pending-uploads
 * Lists the contractor's pending QR-uploaded photos awaiting their
 * approval. These photos live in `contractor_websites.draft_content
 * .pendingUploads` and are NOT visible on the live website.
 */
export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const website = await loadWebsite(tenantDbId);
    if (!website) return jsonResponse({ success: true, data: [] });

    const draft = website.draft_content && typeof website.draft_content === "object"
      ? website.draft_content
      : {};
    const pending = Array.isArray(draft[PENDING_KEY]) ? draft[PENDING_KEY] : [];
    return jsonResponse({ success: true, data: pending });
  } catch (error) {
    console.error("[api/website-builder/pending-uploads][GET] error", error);
    return jsonResponse({ success: false, error: "Unable to load pending uploads" }, 500);
  }
}

/**
 * POST /api/website-builder/pending-uploads
 * Acts on the pending queue.
 *
 * Body shape:
 *   { action: "approve" | "reject" | "approve_all" | "reject_all",
 *     ids?: string[] }
 *
 * - approve: pulls the chosen photos out of pendingUploads and merges
 *   them into draft_content.galleryPhotos so they appear in the
 *   builder's main gallery. Still requires a publish to go live.
 * - reject: drops the photos from pendingUploads (storage object is
 *   retained for now — cleaning the bucket is deferred to a periodic
 *   sweep).
 */
export async function POST(request) {
  try {
    const sameOriginBlock = enforceSameOriginForMutation(request);
    if (sameOriginBlock) return sameOriginBlock;
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").toLowerCase();
    const ids = Array.isArray(body.ids)
      ? body.ids.map((v) => String(v)).filter(Boolean)
      : [];

    if (!["approve", "reject", "approve_all", "reject_all"].includes(action)) {
      return jsonResponse({ success: false, error: "Invalid action" }, 400);
    }

    const website = await loadWebsite(tenantDbId);
    if (!website) {
      return jsonResponse({ success: false, error: "Website not found" }, 404);
    }

    const draft = website.draft_content && typeof website.draft_content === "object"
      ? website.draft_content
      : {};
    const pending = Array.isArray(draft[PENDING_KEY]) ? draft[PENDING_KEY] : [];
    if (pending.length === 0) {
      return jsonResponse({ success: true, data: { remaining: [], moved: 0 } });
    }

    const isAll = action.endsWith("_all");
    const isApprove = action.startsWith("approve");

    const targets = isAll
      ? pending
      : pending.filter((photo) => ids.includes(String(photo?.id || "")));
    const remaining = isAll
      ? []
      : pending.filter((photo) => !ids.includes(String(photo?.id || "")));

    if (targets.length === 0) {
      return jsonResponse({ success: true, data: { remaining: pending, moved: 0 } });
    }

    let nextDraft = { ...draft, [PENDING_KEY]: remaining };

    if (isApprove) {
      const existing = Array.isArray(draft.galleryPhotos) ? draft.galleryPhotos : [];
      const merged = [...existing];
      for (const photo of targets) {
        const normalized = normalizeGalleryPhoto(
          { ...photo, kind: "gallery" },
          merged.length,
        );
        if (normalized.src) merged.push(normalized);
      }
      nextDraft = { ...nextDraft, galleryPhotos: merged };
    }

    const { error: updateError } = await supabaseAdmin
      .from(WEBSITES_TABLE)
      .update({
        draft_content: nextDraft,
        has_unpublished_changes: true,
        draft_updated_at: new Date().toISOString(),
      })
      .eq("id", website.id);

    if (updateError) {
      console.error(
        "[api/website-builder/pending-uploads][POST] update failed",
        updateError.message,
      );
      return jsonResponse({ success: false, error: "Update failed" }, 500);
    }

    return jsonResponse({
      success: true,
      data: {
        remaining: nextDraft[PENDING_KEY],
        moved: isApprove ? targets.length : 0,
        dropped: isApprove ? 0 : targets.length,
        galleryPhotos: nextDraft.galleryPhotos || [],
      },
    });
  } catch (error) {
    console.error("[api/website-builder/pending-uploads][POST] error", error);
    return jsonResponse(
      { success: false, error: error?.message || "Unable to update pending uploads" },
      500,
    );
  }
}
