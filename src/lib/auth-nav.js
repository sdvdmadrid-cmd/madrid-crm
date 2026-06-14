/** Hard navigation for auth transitions — single flash, no intermediate React states. */
export function performAuthHardNavigate(path) {
  const destination = String(path || "").trim();
  if (typeof window === "undefined" || !destination.startsWith("/")) {
    return;
  }
  window.location.replace(destination);
}
