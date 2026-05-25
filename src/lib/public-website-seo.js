import "server-only";

function getAppBaseUrl() {
  return String(
    process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
  ).replace(/\/$/, "");
}

export function getPublicSiteUrl(slug) {
  const base = getAppBaseUrl();
  return `${base}/sites/${encodeURIComponent(String(slug || "").trim().toLowerCase())}`;
}

function isHostedHttpUrl(value) {
  const s = String(value || "").trim();
  return /^https?:\/\//i.test(s);
}

function pickPhotoSrc(photo) {
  if (!photo) return "";
  if (typeof photo === "string") return photo;
  return photo.src || photo.url || "";
}

/**
 * Returns the first hosted (https/http) photo URL we can find on the
 * public site, suitable for use as an Open Graph / Twitter card image.
 * Skips `data:` URLs since those can't be fetched by external crawlers.
 */
export function resolvePublicSiteSocialImage(site) {
  if (!site) return null;
  const candidates = [
    ...(Array.isArray(site.galleryPhotos) ? site.galleryPhotos : []),
    ...(Array.isArray(site.heroPhotos) ? site.heroPhotos : []),
    ...(Array.isArray(site.portfolio?.featured) ? site.portfolio.featured : []),
  ];
  for (const photo of candidates) {
    const src = pickPhotoSrc(photo);
    if (isHostedHttpUrl(src)) return src;
  }
  const logo = site.companyProfile?.logoDataUrl || "";
  if (isHostedHttpUrl(logo)) return logo;
  return null;
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

  // Paquete D: surface aggregate review counts in schema.org so search
  // engines can render star ratings in SERPs. Only emit when we have at
  // least one verified rating to avoid AggregateRating with 0 reviews.
  const stats = site.reviewStats;
  if (
    stats &&
    Number.isFinite(Number(stats.count)) &&
    Number(stats.count) > 0 &&
    Number.isFinite(Number(stats.averageRating)) &&
    Number(stats.averageRating) > 0
  ) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(stats.averageRating).toFixed(1),
      reviewCount: Number(stats.count),
      bestRating: "5",
      worstRating: "1",
    };
  }

  // Paquete D: emit up to 5 individual reviews so the schema.org listing
  // has real Review entries. Each review must have a rating + body. We
  // intentionally cap at 5 to keep the rendered JSON-LD lean.
  const reviewItems = Array.isArray(site.publicReviews) ? site.publicReviews.slice(0, 5) : [];
  if (reviewItems.length > 0) {
    jsonLd.review = reviewItems
      .filter((rv) => rv && Number.isFinite(Number(rv.rating)) && rv.reviewText)
      .map((rv) => ({
        "@type": "Review",
        author: { "@type": "Person", name: rv.authorName || "Customer" },
        reviewRating: {
          "@type": "Rating",
          ratingValue: Number(rv.rating).toFixed(1),
          bestRating: "5",
          worstRating: "1",
        },
        reviewBody: String(rv.reviewText).slice(0, 800),
        datePublished: rv.reviewDate || undefined,
      }));
    if (jsonLd.review.length === 0) delete jsonLd.review;
  }

  return jsonLd;
}

export function buildPublicSiteMetadata(site, { page = "home" } = {}) {
  const companyName =
    site?.companyProfile?.publicDisplayName ||
    site?.companyProfile?.companyName ||
    "Local Business";
  const seoTitle = String(site?.seoTitle || "").trim();
  const seoDescription = String(site?.seoDescription || "").trim();
  const title =
    page === "request"
      ? `Request a Quote | ${companyName}`
      : seoTitle || site?.headline || companyName;
  const description =
    page === "request"
      ? `Request a free quote from ${companyName}. Fast response, no obligation.`
      : seoDescription ||
        site?.subheadline ||
        site?.aboutText?.slice(0, 160) ||
        `${companyName} — professional home services in your area.`;
  const url =
    page === "request"
      ? `${getPublicSiteUrl(site.slug)}/request`
      : getPublicSiteUrl(site.slug);
  const themeColor = site?.themeColor || "#1d4ed8";

  const socialImage = resolvePublicSiteSocialImage(site);
  const openGraph = {
    type: "website",
    url,
    title,
    description,
    siteName: companyName,
  };
  const twitter = {
    card: "summary_large_image",
    title,
    description,
  };
  if (socialImage) {
    openGraph.images = [
      { url: socialImage, alt: `${companyName} — featured project` },
    ];
    twitter.images = [socialImage];
  }

  return {
    title: { absolute: title },
    description,
    metadataBase: new URL(getAppBaseUrl()),
    alternates: { canonical: url },
    openGraph,
    twitter,
    robots: {
      index: true,
      follow: true,
    },
    other: {
      "theme-color": themeColor,
    },
  };
}
