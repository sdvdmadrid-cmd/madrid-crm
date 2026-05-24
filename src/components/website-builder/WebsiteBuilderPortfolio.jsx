"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  MAX_PORTFOLIO_PHOTOS,
  MAX_UPLOAD_BATCH,
  buildFeaturedGallery,
  countPortfolioPhotos,
  createPortfolioProject,
  normalizePortfolio,
} from "@/lib/website-gallery";
import { compressImageFile, fileToDataUrl } from "@/lib/website-image-compress";
import styles from "./website-builder.module.css";

const CATEGORIES = [
  { id: "general", label: "General" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bathroom", label: "Bathroom" },
  { id: "roofing", label: "Roofing" },
  { id: "landscape", label: "Landscape" },
  { id: "before-after", label: "Before / After" },
];

export default function WebsiteBuilderPortfolio({
  t,
  portfolio,
  onPortfolioChange,
  onSyncFeaturedGallery,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [activeProjectId, setActiveProjectId] = useState(
    () => portfolio?.projects?.[0]?.id || "",
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);

  const normalized = useMemo(() => normalizePortfolio(portfolio), [portfolio]);
  const totalPhotos = countPortfolioPhotos(normalized);
  const activeProject =
    normalized.projects.find((p) => p.id === activeProjectId) ||
    normalized.projects[0] ||
    null;

  const persistPortfolio = useCallback(
    (next) => {
      const clean = normalizePortfolio(next);
      onPortfolioChange?.(clean);
      onSyncFeaturedGallery?.(buildFeaturedGallery(clean));
    },
    [onPortfolioChange, onSyncFeaturedGallery],
  );

  const handleAddProject = () => {
    const project = createPortfolioProject(t.portfolioNewProject, "general");
    persistPortfolio({
      ...normalized,
      projects: [project, ...normalized.projects],
    });
    setActiveProjectId(project.id);
  };

  const uploadBatch = async (files, projectId, kind = "work") => {
    if (!files.length || !projectId) return;
    const remaining = MAX_PORTFOLIO_PHOTOS - totalPhotos;
    const batch = files.slice(0, remaining);
    if (!batch.length) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: batch.length });

    try {
      const items = [];
      for (let i = 0; i < batch.length; i += 1) {
        const file = batch[i];
        const compressed = await compressImageFile(file).catch(() => file);
        const dataUrl = await fileToDataUrl(compressed);
        items.push({
          id: `ph-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          dataUrl,
          alt: file.name.replace(/\.[^.]+$/, "").slice(0, 160),
          projectId,
          kind,
        });
        setUploadProgress({ done: i + 1, total: batch.length });
      }

      const uploadedPhotos = [];
      for (let offset = 0; offset < items.length; offset += MAX_UPLOAD_BATCH) {
        const chunk = items.slice(offset, offset + MAX_UPLOAD_BATCH);
        const res = await apiFetch("/api/website-builder/gallery/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: chunk }),
          timeoutMs: 120_000,
        });
        const payload = await getJsonOrThrow(res, t.portfolioUploadFailed);
        if (payload?.data?.photos?.length) {
          uploadedPhotos.push(...payload.data.photos);
        }
      }

      if (!uploadedPhotos.length) {
        throw new Error(t.portfolioUploadFailed);
      }

      const nextProjects = normalized.projects.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          photos: [...project.photos, ...uploadedPhotos],
        };
      });

      persistPortfolio({ ...normalized, projects: nextProjects });
    } finally {
      setUploading(false);
      setUploadProgress({ done: 0, total: 0 });
    }
  };

  const handleFiles = async (fileList, kind = "work") => {
    if (!activeProject || disabled || uploading) return;
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    await uploadBatch(files, activeProject.id, kind);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    void handleFiles(event.dataTransfer?.files);
  };

  const removePhoto = (projectId, photoId) => {
    const nextProjects = normalized.projects.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        photos: project.photos.filter((p) => p.id !== photoId),
      };
    });
    persistPortfolio({ ...normalized, projects: nextProjects });
  };

  const removeProject = (projectId) => {
    persistPortfolio({
      ...normalized,
      projects: normalized.projects.filter((p) => p.id !== projectId),
    });
    if (activeProjectId === projectId) {
      setActiveProjectId(normalized.projects.find((p) => p.id !== projectId)?.id || "");
    }
  };

  const pct =
    uploadProgress.total > 0
      ? Math.round((uploadProgress.done / uploadProgress.total) * 100)
      : 0;

  return (
    <div className={styles.portfolioPanel}>
      <div className={styles.portfolioHeader}>
        <div>
          <h3 className={styles.portfolioTitle}>{t.portfolioTitle}</h3>
          <p className={styles.portfolioSubtitle}>{t.portfolioSubtitle}</p>
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSecondary}`}
          disabled={disabled || uploading}
          onClick={handleAddProject}
        >
          {t.portfolioAddProject}
        </button>
      </div>

      <p className={styles.portfolioCount}>
        {t.portfolioPhotoCount
          .replace("{count}", String(totalPhotos))
          .replace("{max}", String(MAX_PORTFOLIO_PHOTOS))}
      </p>

      {normalized.projects.length === 0 ? (
        <p className={styles.portfolioEmpty}>{t.portfolioEmpty}</p>
      ) : (
        <>
          <div className={styles.portfolioProjectTabs}>
            {normalized.projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`${styles.portfolioTab} ${
                  activeProject?.id === project.id ? styles.portfolioTabActive : ""
                }`}
                onClick={() => setActiveProjectId(project.id)}
              >
                {project.name} ({project.photos.length})
              </button>
            ))}
          </div>

          {activeProject ? (
            <div className={styles.portfolioProject}>
              <div className={styles.portfolioProjectMeta}>
                <input
                  className={styles.input}
                  value={activeProject.name}
                  disabled={disabled}
                  onChange={(e) => {
                    const name = e.target.value;
                    persistPortfolio({
                      ...normalized,
                      projects: normalized.projects.map((p) =>
                        p.id === activeProject.id ? { ...p, name } : p,
                      ),
                    });
                  }}
                />
                <select
                  className={styles.input}
                  value={activeProject.category}
                  disabled={disabled}
                  onChange={(e) => {
                    const category = e.target.value;
                    persistPortfolio({
                      ...normalized,
                      projects: normalized.projects.map((p) =>
                        p.id === activeProject.id ? { ...p, category } : p,
                      ),
                    });
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  disabled={disabled}
                  onClick={() => removeProject(activeProject.id)}
                >
                  {t.portfolioDeleteProject}
                </button>
              </div>

              <div
                className={`${styles.portfolioDropzone} ${dragOver ? styles.portfolioDropzoneActive : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <p>{t.portfolioDropHint}</p>
                <div className={styles.portfolioDropActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    disabled={disabled || uploading}
                    onClick={() => inputRef.current?.click()}
                  >
                    {uploading ? t.portfolioUploading : t.portfolioUploadPhotos}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={disabled || uploading}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.multiple = true;
                      input.onchange = () => void handleFiles(input.files, "before");
                      input.click();
                    }}
                  >
                    {t.portfolioUploadBefore}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={disabled || uploading}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.multiple = true;
                      input.onchange = () => void handleFiles(input.files, "after");
                      input.click();
                    }}
                  >
                    {t.portfolioUploadAfter}
                  </button>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => void handleFiles(e.target.files)}
                />
              </div>

              {uploading ? (
                <div className={styles.portfolioProgress}>
                  <div className={styles.portfolioProgressBar} style={{ width: `${pct}%` }} />
                  <span>{t.portfolioUploadProgress.replace("{pct}", String(pct))}</span>
                </div>
              ) : null}

              <div className={styles.portfolioMasonry}>
                {activeProject.photos.map((photo) => (
                  <figure key={photo.id} className={styles.portfolioCard}>
                    <img
                      src={photo.thumbnail || photo.src}
                      alt={photo.alt}
                      loading="lazy"
                      decoding="async"
                    />
                    {photo.kind === "before" || photo.kind === "after" ? (
                      <span className={styles.portfolioBadge}>{photo.kind}</span>
                    ) : null}
                    <button
                      type="button"
                      className={styles.portfolioRemove}
                      disabled={disabled}
                      onClick={() => removePhoto(activeProject.id, photo.id)}
                      aria-label={t.remove}
                    >
                      ×
                    </button>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
