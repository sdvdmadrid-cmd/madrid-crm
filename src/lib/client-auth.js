export async function apiFetch(input, init = {}) {
  const { suppressUnauthorizedEvent = false, ...fetchInit } = init;
  const response = await fetch(input, fetchInit);

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
    throw new Error(payload?.error || fallbackMessage);
  }

  return payload;
}
