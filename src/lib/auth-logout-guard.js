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
