import { performAuthHardNavigate } from "@/lib/auth-nav";
import { supabase } from "@/lib/supabase";
import {
  abortInFlightAuthRequests,
  markClientLoggedOut,
} from "@/lib/auth-logout-guard.js";

let logoutInFlight = false;

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

async function postServerLogout() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Logout failed (${response.status})`);
  }
  const payload = await response.json().catch(() => null);
  if (payload && payload.success === false) {
    throw new Error(payload.error || "Logout failed");
  }
  return response;
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
  if (logoutInFlight) return;
  logoutInFlight = true;

  abortInFlightAuthRequests();
  markClientLoggedOut();
  if (clearIndustry) {
    clearLogoutClientStorage();
  }
  dispatchAuthLogout();

  try {
    let serverLogoutError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await postServerLogout();
        serverLogoutError = null;
        break;
      } catch (error) {
        serverLogoutError = error;
      }
    }
    if (serverLogoutError) {
      throw serverLogoutError;
    }

    await supabase.auth.signOut().catch(() => {});
    logoutInFlight = false;
    performAuthHardNavigate(redirectTo);
  } catch (error) {
    console.error("[auth] logout failed", error);
    logoutInFlight = false;
    throw error;
  }
}
