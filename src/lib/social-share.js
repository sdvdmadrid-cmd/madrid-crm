/**
 * Platform share URL builders (fallback when Web Share API is unavailable).
 */

export function buildFacebookShareUrl(url) {
  const target = String(url || "").trim();
  if (!target) return "";
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(target)}`;
}

export function buildTwitterShareUrl(url, text = "") {
  const target = String(url || "").trim();
  if (!target) return "";
  const params = new URLSearchParams({ url: target });
  const message = String(text || "").trim();
  if (message) params.set("text", message);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function openShareWindow(shareUrl) {
  if (!shareUrl || typeof window === "undefined") return false;
  const popup = window.open(
    shareUrl,
    "_blank",
    "noopener,noreferrer,width=600,height=520",
  );
  return Boolean(popup);
}
