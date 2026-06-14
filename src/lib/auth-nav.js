/** Hard navigation for auth transitions — single flash, no intermediate React states. */
export function performAuthHardNavigate(path) {
  const destination = String(path || "").trim();
  if (typeof window === "undefined" || !destination.startsWith("/")) {
    return;
  }
  window.location.replace(destination);
}

const AUTH_NAV_PING_KEY = "fb_auth_nav_ping";

/** Prevent dashboard ↔ subscribe ping-pong when session is still syncing. */
export function shouldSkipAuthRedirect(destination) {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(AUTH_NAV_PING_KEY);
    if (!raw) return false;
    const [dest, at, count] = JSON.parse(raw);
    return dest === destination && Date.now() - at < 10_000 && count >= 2;
  } catch {
    return false;
  }
}

export function recordAuthNavAttempt(destination) {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(AUTH_NAV_PING_KEY);
    let count = 1;
    if (raw) {
      const [dest, at, prev] = JSON.parse(raw);
      if (dest === destination && Date.now() - at < 10_000) {
        count = (prev || 1) + 1;
      }
    }
    sessionStorage.setItem(
      AUTH_NAV_PING_KEY,
      JSON.stringify([destination, Date.now(), count]),
    );
  } catch {
    /* ignore */
  }
}

export function clearAuthNavAttempt() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(AUTH_NAV_PING_KEY);
  } catch {
    /* ignore */
  }
}
