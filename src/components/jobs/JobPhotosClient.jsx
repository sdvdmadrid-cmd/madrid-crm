"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import {
  getJobFileValidationError,
  JOB_FILE_MAX_BYTES,
  JOB_VIDEO_MAX_BYTES,
} from "@/lib/job-files";
import JobWorkspaceNav from "@/components/jobs/JobWorkspaceNav";
import jobStyles from "@/app/jobs/jobs.module.css";
import "@/i18n";

const STAGE_FILTERS = ["all", "before", "progress", "completion"];

function JobPhotoImage({ src, alt, className, width = 480, height = 360, priority = false }) {
  if (!src) return null;
  return (
    <Image
      src={src}
      alt={alt || ""}
      width={width}
      height={height}
      sizes="(max-width: 768px) 50vw, 240px"
      className={className}
      loading={priority ? "eager" : "lazy"}
      unoptimized
    />
  );
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function groupPhotosByDay(photos) {
  const groups = new Map();
  for (const photo of photos) {
    const key = (photo.takenAt || photo.createdAt || "").slice(0, 10) || "unknown";
    const bucket = groups.get(key) || [];
    bucket.push(photo);
    groups.set(key, bucket);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function detectFileType(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  return "photo";
}

export default function JobPhotosClient({ jobId }) {
  const { t } = useTranslation();
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const [job, setJob] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [uploadStage, setUploadStage] = useState("progress");
  const [viewMode, setViewMode] = useState("gallery");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [editCaption, setEditCaption] = useState("");
  const [progressUrl, setProgressUrl] = useState("");

  const loadPhotos = useCallback(async () => {
    const params = new URLSearchParams({ type: "media", limit: "200" });
    const res = await apiFetch(`/api/jobs/${jobId}/files?${params}`);
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error || t("jobs.photos.loadError"));
    }
    setPhotos(payload.data || []);
  }, [jobId, t]);

  const filteredPhotos = useMemo(() => {
    if (stageFilter === "all") return photos;
    return photos.filter((photo) => photo.photoStage === stageFilter);
  }, [photos, stageFilter]);

  const counts = useMemo(() => {
    const tally = { all: photos.length, before: 0, progress: 0, completion: 0 };
    for (const photo of photos) {
      if (photo.photoStage && tally[photo.photoStage] !== undefined) {
        tally[photo.photoStage] += 1;
      }
    }
    return tally;
  }, [photos]);

  const mediaSummary = useMemo(() => {
    let photoCount = 0;
    let videoCount = 0;
    for (const item of photos) {
      if (item.fileType === "video") videoCount += 1;
      else photoCount += 1;
    }
    return { photoCount, videoCount };
  }, [photos]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const jobRes = await apiFetch(`/api/jobs/${jobId}`);
      const jobPayload = await jobRes.json();
      if (!jobRes.ok) {
        throw new Error(jobPayload.error || t("jobs.photos.jobNotFound"));
      }
      setJob(jobPayload);
      await loadPhotos();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, loadPhotos, t]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadViaSignedUrl = async (file, fileType) => {
    const prepRes = await apiFetch(`/api/jobs/${jobId}/files/signed-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileType,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        photoStage: uploadStage,
        caption: "",
      }),
    });
    const prep = await prepRes.json();
    if (!prepRes.ok || !prep.success) {
      throw new Error(prep.error || t("jobs.photos.uploadError"));
    }

    const putRes = await fetch(prep.data.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(t("jobs.photos.uploadError"));
    }

    const confirmRes = await apiFetch(`/api/jobs/${jobId}/files/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: prep.data.path,
        fileType,
        name: file.name,
        size: file.size,
        photoStage: uploadStage,
        takenAt: new Date().toISOString(),
      }),
    });
    const confirm = await confirmRes.json();
    if (!confirmRes.ok || !confirm.success) {
      throw new Error(confirm.error || t("jobs.photos.uploadError"));
    }
    return confirm.data;
  };

  const uploadViaFormData = async (file, fileType) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileType", fileType);
    formData.append("photoStage", uploadStage);
    formData.append("takenAt", new Date().toISOString());

    const res = await apiFetch(`/api/jobs/${jobId}/files`, {
      method: "POST",
      body: formData,
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error || t("jobs.photos.uploadError"));
    }
    return payload.data;
  };

  const uploadFiles = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;

    setUploading(true);
    setError("");
    setNotice("");

    let uploaded = 0;
    for (const file of files) {
      const fileType = detectFileType(file);
      const validationError = getJobFileValidationError(fileType, file);
      if (validationError) {
        setError(validationError);
        continue;
      }

      try {
        if (fileType === "video" || file.size > 8 * 1024 * 1024) {
          await uploadViaSignedUrl(file, fileType);
        } else {
          await uploadViaFormData(file, fileType);
        }
        uploaded += 1;
      } catch (err) {
        setError(err?.message || t("jobs.photos.uploadError"));
        break;
      }
    }

    setUploading(false);
    if (uploaded > 0) {
      setNotice(
        uploaded === 1
          ? t("jobs.photos.uploadedOne")
          : t("jobs.photos.uploadedMany", { count: uploaded }),
      );
      await loadPhotos();
    }

    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const createProgressLink = async () => {
    setError("");
    const res = await apiFetch(`/api/jobs/${jobId}/progress-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify: true, email: true, sms: true }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || t("jobs.photos.shareError"));
      return;
    }
    const url = payload.data?.url || "";
    setProgressUrl(url);
    const delivery = payload.data?.delivery || {};
    const emailed = delivery?.email?.sent;
    const texted = delivery?.sms?.sent;
    try {
      await navigator.clipboard?.writeText(url);
    } catch {
      // clipboard optional
    }
    if (emailed || texted) {
      setNotice(
        t("jobs.photos.shareSent", {
          channels: [emailed ? "email" : null, texted ? "SMS" : null]
            .filter(Boolean)
            .join(" + "),
        }),
      );
    } else {
      setNotice(t("jobs.photos.shareCopied"));
    }
  };

  const publishToPortfolio = async (photoId) => {
    setError("");
    const res = await apiFetch(
      `/api/jobs/${jobId}/files/${photoId}/publish-portfolio`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || t("jobs.photos.portfolioError"));
      return;
    }
    setNotice(t("jobs.photos.portfolioAdded"));
  };

  const savePhotoMeta = async (photoId, updates) => {
    setError("");
    const res = await apiFetch(`/api/jobs/${jobId}/files/${photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || t("jobs.photos.updateError"));
      return null;
    }
    await loadPhotos();
    return payload.data;
  };

  const deletePhoto = async (photoId) => {
    if (!window.confirm(t("jobs.photos.deleteConfirm"))) return;
    setError("");
    const res = await apiFetch(`/api/jobs/${jobId}/files/${photoId}`, {
      method: "DELETE",
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || t("jobs.photos.deleteError"));
      return;
    }
    setSelectedPhoto(null);
    setNotice(t("jobs.photos.deleted"));
    await loadPhotos();
  };

  const openPhoto = (photo) => {
    setSelectedPhoto(photo);
    setEditCaption(photo.caption || "");
  };

  const stageLabel = (stage) => t(`jobs.photos.stages.${stage || "progress"}`);

  if (loading) {
    return (
      <main className={jobStyles.financialPage}>
        <p className={jobStyles.plMuted}>{t("jobs.photos.loading")}</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main className={jobStyles.financialPage}>
        <p className={jobStyles.plError}>{error || t("jobs.photos.jobNotFound")}</p>
      </main>
    );
  }

  const timelineGroups = groupPhotosByDay(filteredPhotos);

  return (
    <main className={jobStyles.financialPage} data-testid="job-photos-page">
      <header className={jobStyles.financialHeader}>
        <div>
          <Link href="/jobs" className={jobStyles.plToggle}>
            ← {t("jobs.workspace.backToJobs")}
          </Link>
          <h1 className={jobStyles.jobCardTitle}>{job.title}</h1>
          <p className={jobStyles.jobCardMeta}>
            {job.clientName || job.client_name} · {job.service}
          </p>
        </div>
        <div className={jobStyles.photosSummaryPills}>
          <span className={jobStyles.photoCountPill}>
            {t("jobs.photos.totalCount", {
              count: mediaSummary.photoCount,
            })}
          </span>
          <span className={jobStyles.photoCountPill}>
            {t("jobs.photos.videoCount", { count: mediaSummary.videoCount })}
          </span>
        </div>
      </header>

      <JobWorkspaceNav jobId={jobId} active="photos" />

      {error ? <div className={jobStyles.plError}>{error}</div> : null}
      {notice ? <div className={jobStyles.plPositive}>{notice}</div> : null}

      <section className={jobStyles.photosToolbar}>
        <div className={jobStyles.photosUploadRow}>
          <label className={jobStyles.photosStageSelect}>
            <span>{t("jobs.photos.uploadAs")}</span>
            <select
              value={uploadStage}
              onChange={(e) => setUploadStage(e.target.value)}
              data-testid="job-photo-upload-stage"
            >
              <option value="before">{stageLabel("before")}</option>
              <option value="progress">{stageLabel("progress")}</option>
              <option value="completion">{stageLabel("completion")}</option>
            </select>
          </label>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            className={jobStyles.hiddenFileInput}
            onChange={(e) => uploadFiles(e.target.files)}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            className={jobStyles.hiddenFileInput}
            onChange={(e) => uploadFiles(e.target.files)}
          />

          <button
            type="button"
            className={jobStyles.btnFileLink}
            disabled={uploading}
            data-testid="job-photo-camera"
            onClick={() => cameraInputRef.current?.click()}
          >
            {t("jobs.photos.takePhoto")}
          </button>
          <button
            type="button"
            className={jobStyles.btnFileLink}
            disabled={uploading}
            data-testid="job-photo-upload"
            onClick={() => uploadInputRef.current?.click()}
          >
            {uploading ? t("jobs.photos.uploading") : t("jobs.photos.uploadPhotos")}
          </button>
          <button
            type="button"
            className={jobStyles.btnFileLink}
            data-testid="job-progress-share"
            onClick={createProgressLink}
          >
            {t("jobs.photos.shareProgress")}
          </button>
        </div>

        <p className={jobStyles.plMuted}>
          {t("jobs.photos.limitsHint", {
            photoMb: Math.round(JOB_FILE_MAX_BYTES / (1024 * 1024)),
            videoMb: Math.round(JOB_VIDEO_MAX_BYTES / (1024 * 1024)),
          })}
        </p>

        {progressUrl ? (
          <p className={jobStyles.plMuted} data-testid="job-progress-url">
            <a href={progressUrl} target="_blank" rel="noopener noreferrer">
              {progressUrl}
            </a>
          </p>
        ) : null}

        <div className={jobStyles.photosFilterRow}>
          {STAGE_FILTERS.map((stage) => (
            <button
              key={stage}
              type="button"
              className={
                stageFilter === stage
                  ? `${jobStyles.photoFilterBtn} ${jobStyles.photoFilterBtnActive}`
                  : jobStyles.photoFilterBtn
              }
              onClick={() => setStageFilter(stage)}
              data-testid={`job-photo-filter-${stage}`}
            >
              {stage === "all"
                ? t("jobs.photos.filters.all")
                : stageLabel(stage)}
              {stage !== "all" && counts[stage] ? ` (${counts[stage]})` : null}
            </button>
          ))}
        </div>

        <div className={jobStyles.photosViewToggle}>
          <button
            type="button"
            className={viewMode === "gallery" ? jobStyles.photoFilterBtnActive : jobStyles.photoFilterBtn}
            onClick={() => setViewMode("gallery")}
          >
            {t("jobs.photos.viewGallery")}
          </button>
          <button
            type="button"
            className={viewMode === "timeline" ? jobStyles.photoFilterBtnActive : jobStyles.photoFilterBtn}
            onClick={() => setViewMode("timeline")}
          >
            {t("jobs.photos.viewTimeline")}
          </button>
        </div>
      </section>

      {filteredPhotos.length === 0 ? (
        <section className={jobStyles.photosEmpty} data-testid="job-photos-empty">
          <h2>{t("jobs.photos.emptyTitle")}</h2>
          <p>{t("jobs.photos.emptyBody")}</p>
        </section>
      ) : viewMode === "gallery" ? (
        <section className={jobStyles.photoGrid} data-testid="job-photos-gallery">
          {filteredPhotos.map((photo) => (
            <article key={photo.id} className={jobStyles.photoCard}>
              <button
                type="button"
                className={jobStyles.photoThumbBtn}
                onClick={() => openPhoto(photo)}
              >
                {photo.fileType === "video" && photo.signedUrl ? (
                  <video
                    src={photo.signedUrl}
                    className={jobStyles.photoThumbImage}
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : photo.signedUrl ? (
                  <JobPhotoImage
                    src={photo.signedUrl}
                    alt={photo.caption || photo.name}
                    className={jobStyles.photoThumbImage}
                  />
                ) : (
                  <div className={jobStyles.filesPanelMuted}>{photo.name}</div>
                )}
              </button>
              <div className={jobStyles.photoCardMeta}>
                <span className={jobStyles.photoStageBadge}>{stageLabel(photo.photoStage)}</span>
                {photo.fileType === "video" ? (
                  <span className={jobStyles.photoStageBadge}>{t("jobs.photos.videoBadge")}</span>
                ) : null}
                <time dateTime={photo.takenAt || photo.createdAt}>
                  {formatDateTime(photo.takenAt || photo.createdAt)}
                </time>
                {photo.caption ? <p>{photo.caption}</p> : null}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className={jobStyles.photoTimeline} data-testid="job-photos-timeline">
          {timelineGroups.map(([day, items]) => (
            <div key={day} className={jobStyles.photoTimelineDay}>
              <h3>{day === "unknown" ? t("jobs.photos.unknownDate") : day}</h3>
              <div className={jobStyles.photoTimelineList}>
                {items.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    className={jobStyles.photoTimelineItem}
                    onClick={() => openPhoto(photo)}
                  >
                    {photo.fileType === "video" && photo.signedUrl ? (
                      <video
                        src={photo.signedUrl}
                        width={96}
                        height={96}
                        className={jobStyles.photoTimelineThumb}
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : photo.signedUrl ? (
                      <JobPhotoImage
                        src={photo.signedUrl}
                        alt=""
                        width={96}
                        height={96}
                        className={jobStyles.photoTimelineThumb}
                      />
                    ) : null}
                    <div>
                      <strong>{stageLabel(photo.photoStage)}</strong>
                      <span>{formatDateTime(photo.takenAt || photo.createdAt)}</span>
                      {photo.caption ? <p>{photo.caption}</p> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {selectedPhoto ? (
        <div
          className={jobStyles.photoLightbox}
          role="dialog"
          aria-modal="true"
          data-testid="job-photo-lightbox"
        >
          <div className={jobStyles.photoLightboxPanel}>
            <button
              type="button"
              className={jobStyles.photoLightboxClose}
              onClick={() => setSelectedPhoto(null)}
              aria-label={t("jobs.photos.close")}
            >
              ×
            </button>
            {selectedPhoto.fileType === "video" && selectedPhoto.signedUrl ? (
              <video
                src={selectedPhoto.signedUrl}
                className={jobStyles.photoLightboxImage}
                controls
                playsInline
              />
            ) : selectedPhoto.signedUrl ? (
              <JobPhotoImage
                src={selectedPhoto.signedUrl}
                alt={selectedPhoto.caption || selectedPhoto.name}
                className={jobStyles.photoLightboxImage}
                width={1280}
                height={960}
                priority
              />
            ) : null}
            <div className={jobStyles.photoLightboxForm}>
              <label>
                {t("jobs.photos.stageLabel")}
                <select
                  value={selectedPhoto.photoStage || "progress"}
                  onChange={async (e) => {
                    const updated = await savePhotoMeta(selectedPhoto.id, {
                      photoStage: e.target.value,
                    });
                    if (updated) setSelectedPhoto((prev) => ({ ...prev, ...updated }));
                  }}
                >
                  <option value="before">{stageLabel("before")}</option>
                  <option value="progress">{stageLabel("progress")}</option>
                  <option value="completion">{stageLabel("completion")}</option>
                </select>
              </label>
              <label>
                {t("jobs.photos.captionLabel")}
                <textarea
                  value={editCaption}
                  rows={3}
                  onChange={(e) => setEditCaption(e.target.value)}
                  placeholder={t("jobs.photos.captionPlaceholder")}
                />
              </label>
              <div className={jobStyles.photoLightboxActions}>
                <button
                  type="button"
                  className={jobStyles.btnFileLink}
                  onClick={async () => {
                    const updated = await savePhotoMeta(selectedPhoto.id, {
                      caption: editCaption,
                    });
                    if (updated) {
                      setSelectedPhoto((prev) => ({ ...prev, ...updated }));
                      setNotice(t("jobs.photos.saved"));
                    }
                  }}
                >
                  {t("jobs.photos.saveCaption")}
                </button>
                {selectedPhoto.fileType === "photo" ? (
                  <button
                    type="button"
                    className={jobStyles.btnFileLink}
                    onClick={() => publishToPortfolio(selectedPhoto.id)}
                  >
                    {t("jobs.photos.addToPortfolio")}
                  </button>
                ) : null}
                {selectedPhoto.signedUrl ? (
                  <a
                    href={selectedPhoto.signedUrl}
                    download={selectedPhoto.name || "job-media"}
                    className={jobStyles.btnFileLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("jobs.photos.download")}
                  </a>
                ) : null}
                <button
                  type="button"
                  className={jobStyles.plError}
                  style={{ background: "transparent", border: "none", cursor: "pointer" }}
                  onClick={() => deletePhoto(selectedPhoto.id)}
                >
                  {t("jobs.photos.delete")}
                </button>
              </div>
              <p className={jobStyles.plMuted}>
                {formatDateTime(selectedPhoto.takenAt || selectedPhoto.createdAt)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
