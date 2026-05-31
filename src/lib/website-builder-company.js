import { resolveCompanyLogoUrl } from "@/lib/resolve-company-logo-url";

export function getCompanyDisplayName(profile) {
  return String(profile?.publicDisplayName || profile?.companyName || "").trim();
}

export function isCompanyProfileEstablished(profile) {
  const name = getCompanyDisplayName(profile);
  if (!name) return false;

  const hasLogo = Boolean(resolveCompanyLogoUrl(profile));
  const hasPhone = Boolean(String(profile?.phone || "").trim());
  const hasAddress = Boolean(String(profile?.businessAddress || "").trim());
  const hasBusinessType = Boolean(String(profile?.businessType || "").trim());

  return hasLogo || hasPhone || hasAddress || hasBusinessType;
}

/** Single-tenant workspaces always edit one company — lock industry switching once profile exists. */
export function shouldLockWebsiteIndustry(profile) {
  return isCompanyProfileEstablished(profile);
}
