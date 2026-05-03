import { enforceSameOriginForMutation } from "@/lib/request-security";
import { JOB_FILES_BUCKET } from "@/lib/job-files";
import { logSupabaseError } from "@/lib/supabase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
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
    logSupabaseError(
      "[api/jobs/:id/files/:fileId][JOB_LOOKUP] Supabase query error",
      error,
      { id, tenantDbId, role },
    );
    throw new Error(error.message);
  }

  return data;
}

export async function DELETE(request, { params }) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: jobId, fileId } = await params;
    if (!jobId || !fileId) {
      return jsonResponse({ success: false, error: "Invalid parameters" }, 400);
    }

    const job = await resolveAuthorizedJob({ id: jobId, tenantDbId, role });
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const { data: fileRow, error: fileError } = await supabaseAdmin
      .from(JOB_FILES)
      .select("id, file_path")
      .eq("id", fileId)
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fileError) {
      logSupabaseError(
        "[api/jobs/:id/files/:fileId][DELETE] Supabase query error",
        fileError,
        { tenantDbId, role, userId, jobId, fileId },
      );
      throw new Error(fileError.message);
    }

    if (!fileRow) {
      return jsonResponse({ success: false, error: "File not found" }, 404);
    }

    if (fileRow.file_path) {
      const { error: removeError } = await supabaseAdmin.storage
        .from(JOB_FILES_BUCKET)
        .remove([fileRow.file_path]);
      if (removeError) {
        throw new Error(removeError.message);
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from(JOB_FILES)
      .delete()
      .eq("id", fileId)
      .eq("job_id", jobId)
      .eq("user_id", userId);

    if (deleteError) {
      logSupabaseError(
        "[api/jobs/:id/files/:fileId][DELETE] Supabase delete error",
        deleteError,
        { tenantDbId, role, userId, jobId, fileId },
      );
      throw new Error("Unable to delete file");
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("[api/jobs/:id/files/:fileId][DELETE] error", error);
    return jsonResponse({ success: false, error: "Unable to delete file" }, 500);
  }
}
