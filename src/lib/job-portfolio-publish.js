import "server-only";

import { JOB_FILES_BUCKET } from "@/lib/job-files";
import { normalizeGalleryPhoto } from "@/lib/website-gallery";
import { uploadWebsiteImageBuffer } from "@/lib/website-media-storage";
import { supabaseAdmin } from "@/lib/supabase-admin";

const WEBSITES_TABLE = "contractor_websites";
const JOB_FILES = "job_files";
const JOBS = "jobs";

/**
 * Copy a job photo into the contractor website draft gallery.
 * Soft-fail friendly: never throws for missing website / storage issues
 * unless `throwOnError` is true (HTTP route).
 */
export async function publishJobPhotoToPortfolio({
  tenantId,
  jobId,
  fileId,
  throwOnError = false,
} = {}) {
  try {
    const tid = String(tenantId || "").trim();
    const jid = String(jobId || "").trim();
    const fid = String(fileId || "").trim();
    if (!tid || !jid || !fid) {
      return { ok: false, skipped: true, reason: "missing_ids" };
    }

    const { data: fileRow, error: fileError } = await supabaseAdmin
      .from(JOB_FILES)
      .select("id, job_id, file_type, file_path, name, caption, photo_stage")
      .eq("id", fid)
      .eq("job_id", jid)
      .maybeSingle();

    if (fileError) throw new Error(fileError.message);
    if (!fileRow) {
      return { ok: false, skipped: true, reason: "file_not_found" };
    }
    if (fileRow.file_type !== "photo") {
      return { ok: false, skipped: true, reason: "not_a_photo" };
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from(JOBS)
      .select("id, title, service")
      .eq("id", jid)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);

    const { data: website, error: websiteError } = await supabaseAdmin
      .from(WEBSITES_TABLE)
      .select("id, slug, draft_content")
      .eq("tenant_id", tid)
      .maybeSingle();
    if (websiteError) throw new Error(websiteError.message);
    if (!website) {
      return { ok: false, skipped: true, reason: "no_website" };
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
      tenantId: tid,
      slug: website.slug || "site",
      buffer,
      mime,
      kind: "portfolio-job",
    });
    if (!publicUrl) {
      return { ok: false, skipped: true, reason: "upload_failed" };
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
          `${job?.title || "Project"} — ${fileRow.photo_stage || "work"}`,
        kind:
          fileRow.photo_stage === "before"
            ? "before"
            : fileRow.photo_stage === "completion"
              ? "after"
              : "work",
        projectId: `job-${jid}`,
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

    return {
      ok: true,
      url: publicUrl,
      galleryCount: galleryPhotos.length,
      unpublished: true,
      already,
    };
  } catch (error) {
    console.warn(
      "[job-portfolio-publish] soft-fail",
      error?.message || error,
    );
    if (throwOnError) throw error;
    return {
      ok: false,
      skipped: true,
      reason: "publish_error",
      error: error?.message || "Unable to publish",
    };
  }
}

/** Soft auto-publish when a photo is tagged as completion. */
export async function maybeAutoPublishCompletionPhoto({
  tenantId,
  jobId,
  fileRow,
} = {}) {
  if (!fileRow || fileRow.file_type !== "photo") {
    return { ok: false, skipped: true, reason: "not_eligible" };
  }
  if (String(fileRow.photo_stage || "").toLowerCase() !== "completion") {
    return { ok: false, skipped: true, reason: "not_completion" };
  }
  return publishJobPhotoToPortfolio({
    tenantId,
    jobId,
    fileId: fileRow.id,
    throwOnError: false,
  });
}
