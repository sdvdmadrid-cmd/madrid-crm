import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  buildJobFilePath,
  getJobFileMaxBytes,
  JOB_FILE_ACCEPTED_MIME_TYPES,
  JOB_FILE_TYPE_VALUES,
  JOB_FILES_BUCKET,
  isJobTimelineMediaType,
  normalizePhotoStage,
} from "@/lib/job-files";
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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveAuthorizedJob({ id, tenantDbId, role }) {
  let query = supabaseAdmin
    .from(JOBS)
    .select("id, user_id, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if ((role || "").toLowerCase() !== "super_admin") {
    query = supabaseAdmin
      .from(JOBS)
      .select("id, user_id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", tenantDbId)
      .maybeSingle();
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError("[api/jobs/:id/files/signed-upload] job lookup", error, {
      id,
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }
  return data;
}

/**
 * POST /api/jobs/[id]/files/signed-upload
 * Issue a direct-to-storage upload URL (needed for larger videos).
 */
export async function POST(request, { params }) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, userId, authenticated } = context;
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: jobId } = await params;
    if (!jobId) {
      return jsonResponse({ success: false, error: "Invalid job id" }, 400);
    }

    const job = await resolveAuthorizedJob({ id: jobId, tenantDbId, role });
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const fileType = String(body.fileType || "").trim().toLowerCase();
    const fileName = String(body.fileName || "file").trim();
    const mimeType = String(body.mimeType || "").trim().toLowerCase();
    const size = Number(body.size || 0);

    if (!JOB_FILE_TYPE_VALUES.has(fileType)) {
      return jsonResponse({ success: false, error: "Invalid file type" }, 400);
    }
    if (size <= 0) {
      return jsonResponse({ success: false, error: "File is empty" }, 400);
    }
    if (size > getJobFileMaxBytes(fileType)) {
      return jsonResponse(
        {
          success: false,
          error:
            fileType === "video"
              ? "Video exceeds 50MB limit"
              : "File exceeds 15MB limit",
        },
        400,
      );
    }
    const allowed = JOB_FILE_ACCEPTED_MIME_TYPES[fileType];
    if (!allowed?.has(mimeType)) {
      return jsonResponse({ success: false, error: "Unsupported media type" }, 400);
    }

    const photoStage = isJobTimelineMediaType(fileType)
      ? normalizePhotoStage(body.photoStage)
      : null;
    const caption = isJobTimelineMediaType(fileType)
      ? String(body.caption || "").trim().slice(0, 500)
      : "";

    const filePath = buildJobFilePath({
      userId,
      jobId,
      fileType,
      fileName,
      mimeType,
    });

    const { data, error } = await supabaseAdmin.storage
      .from(JOB_FILES_BUCKET)
      .createSignedUploadUrl(filePath);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Unable to create upload URL");
    }

    return jsonResponse({
      success: true,
      data: {
        bucket: JOB_FILES_BUCKET,
        path: filePath,
        token: data.token || "",
        signedUrl: data.signedUrl,
        fileType,
        photoStage,
        caption,
        mimeType,
        name: fileName,
        size,
      },
    });
  } catch (error) {
    console.error("[api/jobs/:id/files/signed-upload][POST] error", error);
    return jsonResponse({ success: false, error: "Unable to prepare upload" }, 500);
  }
}
