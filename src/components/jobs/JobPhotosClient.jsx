"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import { getJobFileValidationError } from "@/lib/job-files";
import JobWorkspaceNav from "@/components/jobs/JobWorkspaceNav";
import jobStyles from "@/app/jobs/jobs.module.css";
import "@/i18n";

const STAGE_FILTERS = ["all", "before", "progress", "completion"];

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

  const loadPhotos = useCallback(async () => {
    const params = new URLSearchParams({ type: "photo", limit: "120" });
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

  const uploadFiles = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;

    setUploading(true);
    setError("");
    setNotice("");

    let uploaded = 0;
    for (const file of files) {
      const validationError = getJobFileValidationError("photo", file);
      if (validationError) {
        setError(validationError);
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", "photo");
      formData.append("photoStage", uploadStage);
      formData.append("takenAt", new Date().toISOString());

      const res = await apiFetch(`/api/jobs/${jobId}/files`, {
        method: "POST",
        body: formData,
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        setError(payload.error || t("jobs.photos.uploadError"));
        break;
      }
      uploaded += 1;
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
            {t("jobs.photos.totalCount", { count: photos.length })}
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
            accept="image/*"
            capture="environment"
            multiple
            className={jobStyles.hiddenFileInput}
            onChange={(e) => uploadFiles(e.target.files)}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png"
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
        </div>

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
                {photo.signedUrl ? (
                  <img src={photo.signedUrl} alt={photo.caption || photo.name} loading="lazy" />
                ) : (
                  <div className={jobStyles.filesPanelMuted}>{photo.name}</div>
                )}
              </button>
              <div className={jobStyles.photoCardMeta}>
                <span className={jobStyles.photoStageBadge}>{stageLabel(photo.photoStage)}</span>
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
                    {photo.signedUrl ? (
                      <img src={photo.signedUrl} alt="" loading="lazy" />
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
            {selectedPhoto.signedUrl ? (
              <img
                src={selectedPhoto.signedUrl}
                alt={selectedPhoto.caption || selectedPhoto.name}
                className={jobStyles.photoLightboxImage}
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
                {selectedPhoto.signedUrl ? (
                  <a
                    href={selectedPhoto.signedUrl}
                    download={selectedPhoto.name || "job-photo.jpg"}
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
