export async function apiFetch(input, init = {}) {
  const {
    suppressUnauthorizedEvent = false,
    timeoutMs = 0,
    signal,
    ...fetchInit
  } = init;

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && typeof setTimeout === "function"
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  const response = await fetch(input, {
    ...fetchInit,
    signal: signal || controller?.signal,
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
    throw error;
  }

  return payload;
}
