import { enforceSameOriginForMutation } from "@/lib/request-security";
import { JOB_FILES_BUCKET } from "@/lib/job-files";
import { normalizeGalleryPhoto } from "@/lib/website-gallery";
import { uploadWebsiteImageBuffer } from "@/lib/website-media-storage";
import { logSupabaseError } from "@/lib/supabase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

const JOBS = "jobs";
const JOB_FILES = "job_files";
const WEBSITES_TABLE = "contractor_websites";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveAuthorizedJob({ id, tenantDbId, role }) {
  let query = supabaseAdmin
    .from(JOBS)
    .select("id, user_id, tenant_id, title, service")
    .eq("id", id)
    .maybeSingle();

  if ((role || "").toLowerCase() !== "super_admin") {
    query = supabaseAdmin
      .from(JOBS)
      .select("id, user_id, tenant_id, title, service")
      .eq("id", id)
      .eq("tenant_id", tenantDbId)
      .maybeSingle();
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError("[api/jobs/.../publish-portfolio] job lookup", error, {
      id,
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }
  return data;
}

/**
 * POST /api/jobs/[id]/files/[fileId]/publish-portfolio
 * Copy a completion/progress photo into the website draft gallery (soft-fail friendly).
 */
export async function POST(request, { params }) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated } = context;
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: jobId, fileId } = await params;
    if (!jobId || !fileId) {
      return jsonResponse({ success: false, error: "Invalid ids" }, 400);
    }

    const job = await resolveAuthorizedJob({ id: jobId, tenantDbId, role });
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const { data: fileRow, error: fileError } = await supabaseAdmin
      .from(JOB_FILES)
      .select("id, job_id, file_type, file_path, name, caption, photo_stage")
      .eq("id", fileId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (fileError) throw new Error(fileError.message);
    if (!fileRow) {
      return jsonResponse({ success: false, error: "File not found" }, 404);
    }
    if (fileRow.file_type !== "photo") {
      return jsonResponse(
        { success: false, error: "Only photos can be added to the website portfolio" },
        400,
      );
    }

    const { data: website, error: websiteError } = await supabaseAdmin
      .from(WEBSITES_TABLE)
      .select("id, slug, draft_content")
      .eq("tenant_id", tenantDbId)
      .maybeSingle();

    if (websiteError) throw new Error(websiteError.message);
    if (!website) {
      return jsonResponse(
        {
          success: false,
          error: "No website found. Create a site in Website Builder first.",
          code: "NO_WEBSITE",
        },
        404,
      );
    }

    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(JOB_FILES_BUCKET)
      .download(fileRow.file_path);

    if (downloadError || !blob) {
      throw new Error(downloadError?.message || "Unable to download job photo");
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const mime = String(blob.type || "image/jpeg").toLowerCase() || "image/jpeg";
    const publicUrl = await uploadWebsiteImageBuffer({
      tenantId: tenantDbId,
      slug: website.slug || "site",
      buffer,
      mime,
      kind: "portfolio-job",
    });

    if (!publicUrl) {
      return jsonResponse({ success: false, error: "Unable to publish photo" }, 500);
    }

    const draft =
      website.draft_content && typeof website.draft_content === "object"
        ? { ...website.draft_content }
        : {};
    const existing = Array.isArray(draft.galleryPhotos) ? draft.galleryPhotos : [];
    const nextPhoto = normalizeGalleryPhoto(
      {
        src: publicUrl,
        alt:
          fileRow.caption ||
          `${job.title || "Project"} — ${fileRow.photo_stage || "work"}`,
        kind:
          fileRow.photo_stage === "before"
            ? "before"
            : fileRow.photo_stage === "completion"
              ? "after"
              : "work",
        projectId: `job-${jobId}`,
        persisted: true,
      },
      existing.length,
    );
    const already = existing.some(
      (photo) => String(photo?.src || "").trim() === publicUrl,
    );
    const galleryPhotos = already ? existing : [...existing, nextPhoto];

    const { error: updateError } = await supabaseAdmin
      .from(WEBSITES_TABLE)
      .update({
        draft_content: { ...draft, galleryPhotos },
        has_unpublished_changes: true,
        draft_updated_at: new Date().toISOString(),
      })
      .eq("id", website.id);

    if (updateError) throw new Error(updateError.message);

    return jsonResponse({
      success: true,
      data: {
        url: publicUrl,
        galleryCount: galleryPhotos.length,
        unpublished: true,
      },
    });
  } catch (error) {
    console.error("[api/jobs/.../publish-portfolio][POST] error", error);
    return jsonResponse(
      { success: false, error: "Unable to add photo to portfolio" },
      500,
    );
  }
}
