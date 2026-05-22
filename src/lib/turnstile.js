import "server-only";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileConfigured() {
  return Boolean(
    String(process.env.TURNSTILE_SECRET_KEY || "").trim() &&
      String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim(),
  );
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
