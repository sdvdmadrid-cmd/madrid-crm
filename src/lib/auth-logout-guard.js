/** Shared logout guard — blocks silent session restore after explicit sign-out. */

export const LOGOUT_GUARD_COOKIE = "cf_logged_out";
export const LOGOUT_GUARD_STORAGE_KEY = "cf-auth-logged-out";
export const LOGOUT_GUARD_MAX_AGE_SECONDS = 60 * 60;

export function isLogoutGuardCookieSet(request) {
  const raw = request?.cookies?.get?.(LOGOUT_GUARD_COOKIE)?.value;
  return String(raw || "") === "1";
}

export function markClientLoggedOut() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LOGOUT_GUARD_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearClientLoggedOut() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(LOGOUT_GUARD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isClientLoggedOut() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(LOGOUT_GUARD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let logoutAbortController = null;

/** Abort in-flight authenticated API calls when logout begins. */
export function abortInFlightAuthRequests() {
  if (typeof AbortController === "undefined") return;
  logoutAbortController?.abort();
  logoutAbortController = new AbortController();
}

export function getLogoutAbortSignal() {
  return logoutAbortController?.signal;
}

function mergeAbortSignals(...signals) {
  const active = signals.filter((signal) => signal && !signal.aborted);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

export function mergeApiFetchSignals(signal) {
  return mergeAbortSignals(signal, getLogoutAbortSignal());
}
