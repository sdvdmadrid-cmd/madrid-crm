import "server-only";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function getTurnstileSiteKey() {
  return String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
}

export function isTurnstileTestSiteKey(siteKey = getTurnstileSiteKey()) {
  const key = String(siteKey || "").trim();
  return key.startsWith("1x00000000000000000000") || key.includes("always");
}

export function isTurnstileConfigured() {
  const siteKey = getTurnstileSiteKey();
  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!siteKey || !secret) return false;
  if (process.env.NODE_ENV === "production" && isTurnstileTestSiteKey(siteKey)) {
    console.error(
      "[turnstile] Test site key detected in production. Set production Turnstile keys in environment variables.",
    );
    return false;
  }
  return true;
}

export async function verifyTurnstileToken(token, remoteIp = "") {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) {
    return { ok: true, skipped: true };
  }

  const responseToken = String(token || "").trim();
  if (!responseToken) {
    return { ok: false, error: "CAPTCHA verification required" };
  }

  const body = new URLSearchParams({
    secret,
    response: responseToken,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (json?.success) {
      return { ok: true };
    }
    return {
      ok: false,
      error: "CAPTCHA verification failed. Please try again.",
      codes: json?.["error-codes"] || [],
    };
  } catch (error) {
    console.error("[turnstile] verify error", error?.message || error);
    return { ok: false, error: "CAPTCHA service unavailable" };
  }
}
