import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { JOB_FILES_BUCKET, isJobTimelineMediaType } from "@/lib/job-files";
import { verifyJobProgressToken } from "@/lib/job-progress-access";

export const dynamic = "force-dynamic";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

function serializeTimelineItem(row, signedUrl = "") {
  return {
    id: row.id,
    fileType: row.file_type || "photo",
    name: row.name || "",
    size: Number(row.size || 0),
    photoStage: row.photo_stage || null,
    caption: row.caption || "",
    takenAt: row.taken_at || row.created_at || null,
    createdAt: row.created_at || null,
    mediaUrl: signedUrl || "",
  };
}

/**
 * GET /api/public/jobs/progress/[token]
 * Tokenized live job media timeline for homeowners (photos + videos).
 */
export async function GET(_request, { params }) {
  try {
    const { token: rawToken } = await params;
    const verified = verifyJobProgressToken(rawToken);
    if (!verified.ok) {
      return jsonResponse({ success: false, error: verified.error }, verified.status || 403);
    }

    const jobId = verified.jobId;
    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("id, title, service, status, client_name, description, tenant_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) throw new Error(jobError.message);
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    let companyName = "";
    if (job.tenant_id) {
      const [{ data: website }, companyProfile] = await Promise.all([
        supabaseAdmin
          .from("contractor_websites")
          .select("headline, draft_content")
          .eq("tenant_id", job.tenant_id)
          .maybeSingle(),
        getCompanyProfileByTenant({ tenantId: job.tenant_id }).catch(() => null),
      ]);
      companyName =
        String(companyProfile?.companyName || "").trim() ||
        String(website?.draft_content?.businessName || "").trim() ||
        String(website?.headline || "").trim();
    }

    const { data: rows, error: filesError } = await supabaseAdmin
      .from("job_files")
      .select(
        "id, file_type, name, size, photo_stage, caption, taken_at, created_at, file_path",
      )
      .eq("job_id", jobId)
      .in("file_type", ["photo", "video"])
      .order("taken_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (filesError) throw new Error(filesError.message);

    const mediaRows = (rows || []).filter((row) => isJobTimelineMediaType(row.file_type));
    const paths = mediaRows.map((row) => row.file_path).filter(Boolean);
    let signedUrlMap = new Map();

    if (paths.length > 0) {
      const { data: signedRows, error: signError } = await supabaseAdmin.storage
        .from(JOB_FILES_BUCKET)
        .createSignedUrls(paths, 3600);
      if (signError) throw new Error(signError.message);
      signedUrlMap = new Map(
        (signedRows || []).map((entry, index) => [paths[index], entry?.signedUrl || ""]),
      );
    }

    const items = mediaRows.map((row) =>
      serializeTimelineItem(row, signedUrlMap.get(row.file_path) || ""),
    );

    return jsonResponse({
      success: true,
      data: {
        job: {
          id: job.id,
          title: job.title || "Job progress",
          service: job.service || "",
          status: job.status || "",
          address: "",
          description: String(job.description || "").slice(0, 240),
          clientName: job.client_name || "",
        },
        companyName,
        items,
        photoCount: items.filter((item) => item.fileType === "photo").length,
        videoCount: items.filter((item) => item.fileType === "video").length,
        refreshedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[api/public/jobs/progress][GET] error", error);
    return jsonResponse({ success: false, error: "Unable to load progress" }, 500);
  }
}
