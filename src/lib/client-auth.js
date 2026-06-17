import {
  isClientLoggedOut,
  mergeApiFetchSignals,
} from "@/lib/auth-logout-guard.js";

export async function apiFetch(input, init = {}) {
  const {
    suppressUnauthorizedEvent = false,
    timeoutMs = 0,
    signal,
    ...fetchInit
  } = init;

  if (isClientLoggedOut()) {
    const target = String(input);
    const isLogoutRequest =
      target.includes("/api/auth/logout") ||
      init?.allowWhileLoggedOut === true;
    if (!isLogoutRequest) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && typeof setTimeout === "function"
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  const mergedSignal = mergeApiFetchSignals(signal || controller?.signal);

  const response = await fetch(input, {
    ...fetchInit,
    credentials: fetchInit.credentials ?? "include",
    signal: mergedSignal,
  }).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });

  if (
    response.status === 401 &&
    !suppressUnauthorizedEvent &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  }

  return response;
}

export async function getJsonOrThrow(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error || fallbackMessage);
    error.status = response.status;
    error.code = String(payload?.code || "").trim();
    error.subscribeUrl = String(payload?.subscribeUrl || "").trim();
    error.details =
      payload?.details && typeof payload.details === "object"
        ? payload.details
        : null;
    throw error;
  }

  return payload;
}
