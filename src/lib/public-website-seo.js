import "server-only";

function getAppBaseUrl() {
  return String(
    process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
  ).replace(/\/$/, "");
}

export function getPublicSiteUrl(slug) {
  const base = getAppBaseUrl();
  return `${base}/site/${encodeURIComponent(String(slug || "").trim().toLowerCase())}`;
}

export function buildLocalBusinessJsonLd(site) {
  if (!site?.slug) return null;

  const companyName =
    site.companyProfile?.publicDisplayName ||
    site.companyProfile?.companyName ||
    "Local Business";
  const url = getPublicSiteUrl(site.slug);
  const phone = site.companyProfile?.phone || "";
  const address = site.companyProfile?.businessAddress || "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: companyName,
    url,
    description: site.subheadline || site.aboutText || "",
    telephone: phone || undefined,
    address: address
      ? {
          "@type": "PostalAddress",
          streetAddress: address,
        }
      : undefined,
    areaServed: site.companyProfile?.businessCity || undefined,
    image: site.companyProfile?.logoDataUrl?.startsWith("data:image/")
      ? undefined
      : site.companyProfile?.logoDataUrl || undefined,
  };

  if (site.companyProfile?.googleReviewsUrl) {
    jsonLd.sameAs = [site.companyProfile.googleReviewsUrl];
  }

  const social = site.socialLinks || {};
  const socialUrls = [
    social.facebook,
    social.instagram,
    social.yelp,
    social.tiktok,
    social.linkedin,
  ].filter(Boolean);
  if (socialUrls.length) {
    jsonLd.sameAs = [...(jsonLd.sameAs || []), ...socialUrls];
  }

  return jsonLd;
}

export function buildPublicSiteMetadata(site, { page = "home" } = {}) {
  const companyName =
    site?.companyProfile?.publicDisplayName ||
    site?.companyProfile?.companyName ||
    "Local Business";
  const title =
    page === "request"
      ? `Request a Quote | ${companyName}`
      : site?.headline || companyName;
  const description =
    page === "request"
      ? `Request a free quote from ${companyName}. Fast response, no obligation.`
      : site?.subheadline ||
        site?.aboutText?.slice(0, 160) ||
        `${companyName} — professional home services in your area.`;
  const url =
    page === "request"
      ? `${getPublicSiteUrl(site.slug)}/request`
      : getPublicSiteUrl(site.slug);
  const themeColor = site?.themeColor || "#1d4ed8";

  return {
    title,
    description,
    metadataBase: new URL(getAppBaseUrl()),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: companyName,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
    other: {
      "theme-color": themeColor,
    },
  };
}
