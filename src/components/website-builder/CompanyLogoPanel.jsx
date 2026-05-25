"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-auth";
import styles from "./website-builder.module.css";

const PLACEMENTS = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "centered", label: "Centered" },
  { id: "hidden", label: "Hidden" },
];

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Issue #40 — branding panel for the website builder.
 *
 * Lets the contractor:
 *   - Upload their own logo file (jpg/png/svg/webp, capped at 4 MB).
 *   - Generate a 3D-style logo with the AI prompt curated server-side.
 *   - Pick where the logo appears on invoices, estimates, and quotes.
 *
 * Each action persists immediately and bubbles the new
 * `{ logoUrl, logoPlacement }` up via `onChange` so the parent can
 * refresh its company profile cache.
 */
export default function CompanyLogoPanel({
  t,
  logoUrl,
  logoPlacement = "top-left",
  companyProfile,
  onChange,
}) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingPlacement, setSavingPlacement] = useState(false);
  const [error, setError] = useState("");
  const [generatePrompt, setGeneratePrompt] = useState("");
  const fileInputRef = useRef(null);

  const labels = {
    title: t?.logoTitle || "Company logo",
    sub:
      t?.logoSub ||
      "Show up like a real business. Your logo lands on invoices, estimates, quotes, and your public site.",
    uploadCta: t?.logoUpload || "Upload logo",
    uploadHint: t?.logoUploadHint || "PNG, JPG, SVG or WebP. Max 4 MB.",
    generateCta: t?.logoGenerate || "Generate with AI (3D)",
    generating: t?.logoGenerating || "Generating…",
    uploading: t?.logoUploading || "Uploading…",
    placement: t?.logoPlacement || "Placement on documents",
    promptLabel: t?.logoPromptLabel || "Style notes (optional)",
    promptPlaceholder:
      t?.logoPromptPlaceholder ||
      "e.g. modern leaf icon, dark green and gold, sharp edges",
    errorFileTooBig: t?.logoErrorFileTooBig || "That file is over 4 MB. Pick a smaller image.",
    errorFileType:
      t?.logoErrorFileType ||
      "Only image files are supported (PNG, JPG, SVG, WebP).",
    none: t?.logoNone || "No logo yet",
  };

  const handleFile = useCallback(
    async (file) => {
      setError("");
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError(labels.errorFileType);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(labels.errorFileTooBig);
        return;
      }
      try {
        setUploading(true);
        const dataUrl = await readFileAsDataUrl(file);
        const res = await apiFetch("/api/company-profile/logo/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || "Logo upload failed");
        }
        if (onChange) onChange({ logoUrl: payload.data.logoUrl, logoPlacement });
      } catch (err) {
        setError(err?.message || "Logo upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [labels.errorFileTooBig, labels.errorFileType, logoPlacement, onChange],
  );

  const handleGenerate = useCallback(async () => {
    setError("");
    setGenerating(true);
    try {
      const res = await apiFetch("/api/company-profile/logo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: generatePrompt }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "AI logo generation failed");
      }
      if (onChange) onChange({ logoUrl: payload.data.logoUrl, logoPlacement });
    } catch (err) {
      setError(err?.message || "AI logo generation failed");
    } finally {
      setGenerating(false);
    }
  }, [generatePrompt, logoPlacement, onChange]);

  const handlePlacement = useCallback(
    async (event) => {
      const next = String(event.target.value || "top-left");
      setSavingPlacement(true);
      setError("");
      try {
        const res = await apiFetch("/api/company-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...companyProfile,
            logoUrl,
            logoPlacement: next,
          }),
        });
        if (!res.ok) throw new Error("Could not save placement");
        if (onChange) onChange({ logoUrl, logoPlacement: next });
      } catch (err) {
        setError(err?.message || "Could not save placement");
      } finally {
        setSavingPlacement(false);
      }
    },
    [companyProfile, logoUrl, onChange],
  );

  const hasLogo = Boolean(logoUrl);

  return (
    <section
      className={styles.setupCard}
      style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {hasLogo ? (
          <img
            src={logoUrl}
            alt=""
            style={{
              width: 72,
              height: 72,
              objectFit: "contain",
              borderRadius: 12,
              background: "#fff",
              padding: 6,
            }}
          />
        ) : (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: "rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontSize: 12,
              textAlign: "center",
              padding: 6,
            }}
          >
            {labels.none}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <strong className={styles.setupCompany}>{labels.title}</strong>
          <p className={styles.setupMeta}>{labels.sub}</p>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSave}`}
          disabled={uploading || generating}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? labels.uploading : labels.uploadCta}
        </button>
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          ref={fileInputRef}
          onChange={(event) => handleFile(event.target.files?.[0] || null)}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnAi}`}
          disabled={generating || uploading}
          onClick={handleGenerate}
        >
          {generating ? labels.generating : labels.generateCta}
        </button>
      </div>

      <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
        {labels.uploadHint}
      </p>

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
          color: "#cbd5f5",
        }}
      >
        {labels.promptLabel}
        <input
          type="text"
          value={generatePrompt}
          onChange={(e) => setGeneratePrompt(e.target.value)}
          placeholder={labels.promptPlaceholder}
          maxLength={240}
          style={{
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            color: "#e2e8f0",
            padding: "8px 10px",
            fontSize: 13,
          }}
        />
      </label>

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
          color: "#cbd5f5",
        }}
      >
        {labels.placement}
        <select
          value={logoPlacement}
          onChange={handlePlacement}
          disabled={savingPlacement}
          style={{
            background: "rgba(15,23,42,0.6)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            color: "#e2e8f0",
            padding: "8px 10px",
            fontSize: 13,
          }}
        >
          {PLACEMENTS.map((p) => (
            <option key={p.id} value={p.id}>
              {t?.[`logoPlacement_${p.id}`] || p.label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p style={{ fontSize: 12, color: "#fca5a5", margin: 0 }} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
