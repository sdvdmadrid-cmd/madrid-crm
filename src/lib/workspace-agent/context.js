/**
 * Workspace context for the FieldBase AI assistant.
 */

import { resolvePageFromPathname } from "./pages.js";

export function buildWorkspaceContext({
  pathname = "",
  snapshot = null,
  companyProfile = null,
  authUser = null,
  crmSnapshot = null,
}) {
  const page = resolvePageFromPathname(pathname);
  const form = snapshot?.form && typeof snapshot.form === "object" ? snapshot.form : {};
  const siteMeta =
    snapshot?.siteMeta && typeof snapshot.siteMeta === "object" ? snapshot.siteMeta : {};

  const services = Array.isArray(form.services) ? form.services : [];
  const galleryPhotos = Array.isArray(form.galleryPhotos) ? form.galleryPhotos : [];
  const heroPhotos = Array.isArray(form.heroPhotos) ? form.heroPhotos : [];

  const servicesWithPricing = services.filter((s) =>
    /\$|from\s*\d|\/visit/i.test(String(s?.price || "")),
  );

  const brokenGalleryCandidates = galleryPhotos.filter((p) => {
    const src = String(p?.src || p?.thumbnail || "").trim();
    return src && !src.startsWith("http") && !src.startsWith("data:image/");
  });

  return {
    pathname,
    page,
    role: String(authUser?.role || "").toLowerCase(),
    tenantId: authUser?.tenantId || null,
    company: {
      name:
        companyProfile?.publicDisplayName ||
        companyProfile?.companyName ||
        snapshot?.companyName ||
        "",
      businessType: companyProfile?.business_type || companyProfile?.businessType || "",
      phone: companyProfile?.phone || "",
    },
    industry: {
      key: snapshot?.industry || page.industryKey || "general",
      label: snapshot?.industryLabel || "",
    },
    website: snapshot
      ? {
          published: snapshot.published === true,
          websitePath: snapshot.websitePath || "",
          headline: form.headline || "",
          subheadline: form.subheadline || "",
          servicesCount: services.length,
          servicesWithPricingCount: servicesWithPricing.length,
          galleryCount: galleryPhotos.length,
          brokenGalleryCount: brokenGalleryCandidates.length,
          heroFilled: heroPhotos.filter((p) => p?.src).length,
          seoTitle: siteMeta.seoTitle || "",
          seoDescription: siteMeta.seoDescription || "",
        }
      : null,
    capabilities: page.capabilities,
    crm: crmSnapshot,
  };
}
