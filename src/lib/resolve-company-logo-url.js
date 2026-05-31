/**
 * Prefer hosted logo URL (Supabase Storage); fall back to legacy data URL.
 */
export function resolveCompanyLogoUrl(profile) {
  if (!profile || typeof profile !== "object") return "";

  const hosted = String(profile.logoUrl || "").trim();
  if (hosted.startsWith("https://")) return hosted;

  const legacy = String(profile.logoDataUrl || "").trim();
  if (legacy.startsWith("data:image/") || legacy.startsWith("https://")) {
    return legacy;
  }

  return "";
}
