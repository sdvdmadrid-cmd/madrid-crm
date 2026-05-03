import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  buildJobFilePath,
  getJobFileValidationError,
  JOB_FILES_BUCKET,
} from "@/lib/job-files";
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
    logSupabaseError("[api/jobs/:id/files][JOB_LOOKUP] Supabase query error", error, {
      id,
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }

  return data;
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
    createdAt: row.created_at || null,
    signedUrl,
  };
}

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id: jobId } = await params;
    if (!jobId) {
      return jsonResponse({ success: false, error: "Invalid job id" }, 400);
    }

    const job = await resolveAuthorizedJob({ id: jobId, tenantDbId, role });
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(40, Math.max(1, Number(searchParams.get("limit") || 12)));
    const requestedType = String(searchParams.get("type") || "").trim().toLowerCase();

    let query = supabaseAdmin
      .from(JOB_FILES)
      .select("id, user_id, job_id, file_url, file_path, file_type, name, size, created_at", {
        count: "exact",
      })
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (requestedType === "photo" || requestedType === "document") {
      query = query.eq("file_type", requestedType);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      logSupabaseError("[api/jobs/:id/files][GET] Supabase query error", error, {
        tenantDbId,
        role,
        userId,
        jobId,
        page,
        limit,
      });
      throw new Error(error.message);
    }

    const rows = data || [];
    const paths = rows.map((row) => row.file_path).filter(Boolean);
    let signedUrlMap = new Map();

    if (paths.length > 0) {
      const { data: signedRows, error: signError } = await supabaseAdmin.storage
        .from(JOB_FILES_BUCKET)
        .createSignedUrls(paths, 3600);

      if (signError) {
        throw new Error(signError.message);
      }

      signedUrlMap = new Map(
        (signedRows || []).map((entry, index) => [
          paths[index],
          entry?.signedUrl || "",
        ]),
      );
    }

    const files = rows.map((row) =>
      serializeJobFile(row, signedUrlMap.get(row.file_path) || ""),
    );

    const total = Number(count || 0);
    return jsonResponse({
      success: true,
      data: files,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[api/jobs/:id/files][GET] error", error);
    return jsonResponse({ success: false, error: "Unable to load files" }, 500);
  }
}

export async function POST(request, { params }) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
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

    const formData = await request.formData();
    const file = formData.get("file");
    const fileType = String(formData.get("fileType") || "").trim().toLowerCase();
    const validationError = getJobFileValidationError(fileType, file);
    if (validationError) {
      return jsonResponse({ success: false, error: validationError }, 400);
    }

    const filePath = buildJobFilePath({
      userId,
      jobId,
      fileType,
      fileName: file?.name,
      mimeType: file?.type,
    });

    const uploadResult = await supabaseAdmin.storage
      .from(JOB_FILES_BUCKET)
      .upload(filePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadResult.error) {
      throw new Error(uploadResult.error.message);
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from(JOB_FILES)
      .insert({
        user_id: userId,
        job_id: jobId,
        file_url: `${JOB_FILES_BUCKET}/${filePath}`,
        file_path: filePath,
        file_type: fileType,
        name: String(file.name || "file"),
        size: Number(file.size || 0),
      })
      .select("id, user_id, job_id, file_url, file_path, file_type, name, size, created_at")
      .single();

    if (insertError) {
      logSupabaseError("[api/jobs/:id/files][POST] Supabase insert error", insertError, {
        tenantDbId,
        role,
        userId,
        jobId,
        filePath,
      });
      await supabaseAdmin.storage.from(JOB_FILES_BUCKET).remove([filePath]);
      throw new Error(insertError.message);
    }

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(JOB_FILES_BUCKET)
      .createSignedUrl(filePath, 3600);

    if (signedError) {
      throw new Error(signedError.message);
    }

    return jsonResponse({
      success: true,
      data: serializeJobFile(inserted, signedData?.signedUrl || ""),
    });
  } catch (error) {
    console.error("[api/jobs/:id/files][POST] error", error);
    return jsonResponse({ success: false, error: "Unable to upload file" }, 500);
  }
}
