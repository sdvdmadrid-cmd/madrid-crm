"use client";

import { useRef, useState } from "react";
import { compressImageFile, fileToDataUrl } from "@/lib/website-image-compress";

const MAX_BATCH = 6;

export default function MobileUploadClient({ token }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [thumbs, setThumbs] = useState([]); // local previews of just-uploaded
  const [errorText, setErrorText] = useState("");
  const [acceptedTotal, setAcceptedTotal] = useState(0);

  async function handleFiles(fileList) {
    setMessage("");
    setErrorText("");
    if (!token) {
      setErrorText("Missing upload token in URL.");
      return;
    }
    const files = Array.from(fileList || []).filter((f) =>
      String(f?.type || "").startsWith("image/"),
    );
    if (files.length === 0) {
      setErrorText("No images selected.");
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      const chunks = [];
      for (let i = 0; i < files.length; i += MAX_BATCH) {
        chunks.push(files.slice(i, i + MAX_BATCH));
      }
      let acceptedThisRun = 0;
      let failedThisRun = 0;
      const previews = [];
      for (const chunk of chunks) {
        const items = [];
        for (const file of chunk) {
          try {
            const compressed = await compressImageFile(file, {
              maxEdge: 1600,
              quality: 0.8,
            });
            const dataUrl = await fileToDataUrl(compressed);
            items.push({ dataUrl, alt: String(file.name || "").slice(0, 120) });
            previews.push(dataUrl);
          } catch (err) {
            failedThisRun += 1;
            console.warn("[mobile-upload] compress failed", err?.message);
          }
        }
        if (items.length === 0) continue;
        const res = await fetch("/api/website-builder/qr-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, items }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.success) {
          const reason = payload?.error || `HTTP ${res.status}`;
          setErrorText(reason);
          setBusy(false);
          return;
        }
        acceptedThisRun += Number(payload?.data?.accepted || 0);
        failedThisRun += Number(payload?.data?.rejected || 0);
      }
      setAcceptedTotal((prev) => prev + acceptedThisRun);
      setThumbs((prev) => [...prev, ...previews].slice(-12));
      setMessage(
        acceptedThisRun > 0
          ? `${acceptedThisRun} photo${acceptedThisRun === 1 ? "" : "s"} uploaded.${
              failedThisRun > 0 ? ` ${failedThisRun} failed.` : ""
            } Your contractor will see them in their website builder.`
          : "No photos were accepted. Please try again.",
      );
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setErrorText(err?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        padding: "32px 18px 80px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          Upload photos
        </h1>
        <p style={{ color: "#94a3b8", marginBottom: 22, fontSize: 14 }}>
          Tap the button below to take or pick photos. They'll go straight to
          your contractor's website builder for review.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            width: "100%",
            padding: "16px 18px",
            borderRadius: 14,
            border: "none",
            background: busy ? "#1e40af" : "#2563eb",
            color: "white",
            fontWeight: 800,
            fontSize: 16,
            cursor: busy ? "wait" : "pointer",
            boxShadow: "0 10px 24px rgba(37, 99, 235, 0.45)",
          }}
        >
          {busy ? "Uploading…" : "Take or pick photos"}
        </button>

        {acceptedTotal > 0 ? (
          <p style={{ marginTop: 18, color: "#86efac", fontSize: 13 }}>
            {acceptedTotal} total photo{acceptedTotal === 1 ? "" : "s"} uploaded this session.
          </p>
        ) : null}

        {message ? (
          <div
            role="status"
            style={{
              marginTop: 16,
              background: "#1e293b",
              border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
            }}
          >
            {message}
          </div>
        ) : null}

        {errorText ? (
          <div
            role="alert"
            style={{
              marginTop: 16,
              background: "rgba(127,29,29,0.4)",
              border: "1px solid rgba(248,113,113,0.5)",
              color: "#fecaca",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 13,
            }}
          >
            {errorText}
          </div>
        ) : null}

        {thumbs.length > 0 ? (
          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
            }}
          >
            {thumbs.map((src, idx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={idx}
                src={src}
                alt="Uploaded preview"
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.2)",
                }}
              />
            ))}
          </div>
        ) : null}

        <p
          style={{
            marginTop: 24,
            color: "#64748b",
            fontSize: 12,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          This link is private. Only the contractor who shared it with you can
          see the photos in their dashboard.
        </p>
      </div>
    </main>
  );
}
