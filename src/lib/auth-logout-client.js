import { apiFetch } from "@/lib/client-auth";
import { performAuthHardNavigate } from "@/lib/auth-nav";
import { supabase } from "@/lib/supabase";
import {
  abortInFlightAuthRequests,
  getLogoutAbortSignal,
  markClientLoggedOut,
} from "@/lib/auth-logout-guard.js";

function dispatchAuthLogout() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("auth:logout"));
}

function clearLogoutClientStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("user-industry");
  } catch {
    /* ignore */
  }
}

/**
 * End the session server-side first, then hard-navigate to login.
 * Navigating before /api/auth/logout completes leaves the session cookie valid;
 * middleware then redirects /login back to /dashboard or /owner/overview.
 */
export async function performClientLogout({
  redirectTo = "/login",
  clearIndustry = true,
} = {}) {
  if (typeof window === "undefined") return;

  abortInFlightAuthRequests();
  markClientLoggedOut();
  if (clearIndustry) {
    clearLogoutClientStorage();
  }
  dispatchAuthLogout();

  await Promise.allSettled([
    apiFetch("/api/auth/logout", {
      method: "POST",
      suppressUnauthorizedEvent: true,
      signal: getLogoutAbortSignal(),
    }),
    supabase.auth.signOut(),
  ]);

  performAuthHardNavigate(redirectTo);
}
