"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildFacebookShareUrl,
  buildTwitterShareUrl,
  openShareWindow,
} from "@/lib/social-share";

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
  facebookLabel = "Facebook",
  twitterLabel = "X (Twitter)",
  copyLinkLabel = "Copy link",
  resolveShareData,
  disabled = false,
  style,
  onShared,
}) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState("success");
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  async function resolvePayload() {
    let sharePayload = {
      title: String(title || "").trim(),
      text: String(text || "").trim(),
      url: String(url || "").trim(),
    };

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

    return { sharePayload, fallbackUrl };
  }

  const handleNativeShare = async () => {
    setBusy(true);
    setFeedback("");
    try {
      const { sharePayload, fallbackUrl } = await resolvePayload();
      if (!sharePayload.title && !sharePayload.text && !fallbackUrl) {
        throw new Error("No share content available");
      }

      await navigator.share({
        title: sharePayload.title || undefined,
        text: sharePayload.text || undefined,
        url: fallbackUrl || undefined,
      });
      onShared?.("native");
    } catch (error) {
      if (
        error?.name === "AbortError" ||
        /cancel/i.test(String(error?.message || ""))
      ) {
        return;
      }
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const handleShareClick = async () => {
    if (busy || disabled) return;

    const canUseNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function";

    if (canUseNativeShare) {
      await handleNativeShare();
      return;
    }

    setMenuOpen((open) => !open);
  };

  const runPlatformShare = async (platform) => {
    setBusy(true);
    setFeedback("");
    setMenuOpen(false);
    try {
      const { sharePayload, fallbackUrl } = await resolvePayload();
      if (!fallbackUrl) throw new Error("No share URL available");

      if (platform === "facebook") {
        const fbUrl = buildFacebookShareUrl(fallbackUrl);
        if (!openShareWindow(fbUrl)) throw new Error("Popup blocked");
        onShared?.("facebook");
        return;
      }

      if (platform === "twitter") {
        const twUrl = buildTwitterShareUrl(
          fallbackUrl,
          sharePayload.text || sharePayload.title,
        );
        if (!openShareWindow(twUrl)) throw new Error("Popup blocked");
        onShared?.("twitter");
        return;
      }

      await copyToClipboard(fallbackUrl);
      setFeedback(copiedLabel);
      onShared?.("clipboard");
      window.setTimeout(() => setFeedback(""), 2200);
    } catch (error) {
      setFeedback(copyFailedLabel);
      setFeedbackTone("error");
      window.setTimeout(() => setFeedback(""), 2600);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={menuRef} style={{ display: "grid", gap: 8, position: "relative" }}>
      <button
        type="button"
        onClick={handleShareClick}
        disabled={busy || disabled}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
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

      {menuOpen ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(15,23,42,0.12)",
            padding: 6,
            zIndex: 20,
            display: "grid",
            gap: 4,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runPlatformShare("facebook")}
            style={menuItemStyle}
          >
            {facebookLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runPlatformShare("twitter")}
            style={menuItemStyle}
          >
            {twitterLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runPlatformShare("copy")}
            style={menuItemStyle}
          >
            {copyLinkLabel}
          </button>
        </div>
      ) : null}

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

const menuItemStyle = {
  border: "none",
  background: "transparent",
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  color: "#0f172a",
  cursor: "pointer",
};
