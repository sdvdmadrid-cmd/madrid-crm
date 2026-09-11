import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  getJobFileMaxBytes,
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
const JOB_FILES = "job_files";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serializeJobFile(row, signedUrl = "") {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    fileUrl: row.file_url || "",
    filePath: row.file_path || "",
    fileType: row.file_type || "document",
    name: row.name || "",
    size: Number(row.size || 0),
    photoStage: row.photo_stage || null,
    caption: row.caption || "",
    takenAt: row.taken_at || row.created_at || null,
    createdAt: row.created_at || null,
    signedUrl,
  };
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
    logSupabaseError("[api/jobs/:id/files/confirm] job lookup", error, {
      id,
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }
  return data;
}

/**
 * POST /api/jobs/[id]/files/confirm
 * Finalize a signed upload into job_files metadata.
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
    const filePath = String(body.path || "").trim();
    const name = String(body.name || "file").trim().slice(0, 200);
    const size = Number(body.size || 0);
    const expectedPrefix = `${userId}/${jobId}/`;

    if (!JOB_FILE_TYPE_VALUES.has(fileType)) {
      return jsonResponse({ success: false, error: "Invalid file type" }, 400);
    }
    if (!filePath.startsWith(expectedPrefix)) {
      return jsonResponse({ success: false, error: "Invalid upload path" }, 400);
    }
    if (size <= 0 || size > getJobFileMaxBytes(fileType)) {
      return jsonResponse({ success: false, error: "Invalid file size" }, 400);
    }

    const { data: listed, error: listError } = await supabaseAdmin.storage
      .from(JOB_FILES_BUCKET)
      .list(filePath.split("/").slice(0, -1).join("/"), {
        search: filePath.split("/").pop(),
        limit: 1,
      });
    if (listError) throw new Error(listError.message);
    if (!listed?.length) {
      return jsonResponse({ success: false, error: "Upload not found in storage" }, 400);
    }

    const photoStage = isJobTimelineMediaType(fileType)
      ? normalizePhotoStage(body.photoStage)
      : null;
    const caption = isJobTimelineMediaType(fileType)
      ? String(body.caption || "").trim().slice(0, 500)
      : "";
    const takenAtRaw = String(body.takenAt || "").trim();
    const takenAt = isJobTimelineMediaType(fileType)
      ? takenAtRaw
        ? new Date(takenAtRaw).toISOString()
        : new Date().toISOString()
      : null;

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from(JOB_FILES)
      .insert({
        user_id: userId,
        job_id: jobId,
        file_url: `${JOB_FILES_BUCKET}/${filePath}`,
        file_path: filePath,
        file_type: fileType,
        name: name || "file",
        size,
        photo_stage: photoStage,
        caption,
        taken_at: takenAt,
      })
      .select(
        "id, user_id, job_id, file_url, file_path, file_type, name, size, photo_stage, caption, taken_at, created_at",
      )
      .single();

    if (insertError) {
      logSupabaseError("[api/jobs/:id/files/confirm] insert", insertError, {
        tenantDbId,
        role,
        userId,
        jobId,
        filePath,
      });
      throw new Error(insertError.message);
    }

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(JOB_FILES_BUCKET)
      .createSignedUrl(filePath, 3600);
    if (signedError) throw new Error(signedError.message);

    return jsonResponse({
      success: true,
      data: serializeJobFile(inserted, signedData?.signedUrl || ""),
    });
  } catch (error) {
    console.error("[api/jobs/:id/files/confirm][POST] error", error);
    return jsonResponse({ success: false, error: "Unable to confirm upload" }, 500);
  }
}
