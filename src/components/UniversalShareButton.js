"use client";

import { useState } from "react";

async function copyToClipboard(value) {
  if (!value) {
    throw new Error("No share URL available");
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  document.body.appendChild(textArea);
  textArea.select();

  const ok = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!ok) {
    throw new Error("Clipboard copy failed");
  }
}

export default function UniversalShareButton({
  url = "",
  title = "",
  text = "",
  label = "Share",
  copiedLabel = "Link copied",
  copyFailedLabel = "Unable to copy link",
  resolveShareData,
  disabled = false,
  style,
  onShared,
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState("success");

  const handleShare = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setFeedback("");
    setFeedbackTone("success");

    let sharePayload = {
      title: String(title || "").trim(),
      text: String(text || "").trim(),
      url: String(url || "").trim(),
    };

    try {
      if (typeof resolveShareData === "function") {
        const resolved = await resolveShareData();
        if (resolved && typeof resolved === "object") {
          sharePayload = {
            title:
              resolved.title !== undefined
                ? String(resolved.title || "").trim()
                : sharePayload.title,
            text:
              resolved.text !== undefined
                ? String(resolved.text || "").trim()
                : sharePayload.text,
            url:
              resolved.url !== undefined
                ? String(resolved.url || "").trim()
                : sharePayload.url,
          };
        }
      }

      const fallbackUrl =
        sharePayload.url ||
        (typeof resolveShareData !== "function" && typeof window !== "undefined"
          ? window.location.href
          : "");

      if (!sharePayload.title && !sharePayload.text && !fallbackUrl) {
        throw new Error("No share content available");
      }

      const canUseNativeShare =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function";

      if (canUseNativeShare) {
        const nativePayload = {
          title: sharePayload.title || undefined,
          text: sharePayload.text || undefined,
          url: fallbackUrl || undefined,
        };

        await navigator.share(nativePayload);
        onShared?.("native");
        return;
      }

      await copyToClipboard(fallbackUrl);
      setFeedback(copiedLabel);
      onShared?.("clipboard");
      window.setTimeout(() => setFeedback(""), 2200);
    } catch (error) {
      // User-cancelled native share should be silent.
      if (
        error?.name === "AbortError" ||
        /cancel/i.test(String(error?.message || ""))
      ) {
        return;
      }

      try {
        await copyToClipboard(fallbackUrl);
        setFeedback(copiedLabel);
        setFeedbackTone("success");
        onShared?.("clipboard");
        window.setTimeout(() => setFeedback(""), 2200);
      } catch {
        setFeedback(copyFailedLabel);
        setFeedbackTone("error");
        window.setTimeout(() => setFeedback(""), 2600);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button
        type="button"
        onClick={handleShare}
        disabled={busy || disabled}
        style={{
          border: "1.5px solid #cbd5e1",
          background: "white",
          color: "#0f172a",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          cursor: busy ? "wait" : disabled ? "default" : "pointer",
          minHeight: 44,
          opacity: disabled ? 0.6 : 1,
          ...style,
        }}
      >
        {busy ? "..." : label}
      </button>
      {feedback ? (
        <div
          style={{
            fontSize: 12,
            color: feedbackTone === "error" ? "#b91c1c" : "#166534",
            fontWeight: 600,
          }}
        >
          {feedback}
        </div>
      ) : null}
    </div>
  );
}
