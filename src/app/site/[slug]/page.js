import { notFound } from "next/navigation";
import PublicSiteAnalytics from "@/components/site/PublicSiteAnalytics";
import PublicSiteFooter from "@/components/site/PublicSiteFooter";
import PublicSiteNav from "@/components/site/PublicSiteNav";
import RequestServiceForm from "@/components/site/RequestServiceForm";
import PremiumGallery from "@/components/site/PremiumGallery";
import PublicServicesSection from "@/components/site/PublicServicesSection";
import { filterHomeownerFacingServices } from "@/lib/website-lead-form";
import { LANDSCAPING_DEFAULT_SERVICES } from "@/lib/website-content-purity";
import PublicReviewsSection from "@/components/site/PublicReviewsSection";
import PublicReviewsCta from "@/components/site/PublicReviewsCta";
import { getPublicReviewsBySlug } from "@/lib/reputation-store";
import PublicSiteEnhancements from "@/components/site/PublicSiteEnhancements";
import PublicSiteScrollNav from "@/components/site/PublicSiteScrollNav";
import { PUBLIC_SITE_SECTIONS } from "@/lib/public-site-navigation";
import PublicSiteLeadExperience from "@/components/site/PublicSiteLeadExperience";
import { resolveCompanyLogoUrl } from "@/lib/resolve-company-logo-url";
import { resolveWebsiteRequestServices } from "@/lib/website-lead-form";
import { getIndustryProfile } from "@/lib/industry-profiles";
import { buildLocalBusinessJsonLd, buildPublicSiteMetadata } from "@/lib/public-website-seo";
import { getPublicWebsiteBySlug } from "@/lib/public-website";
import { fillPublicSiteTemplate, getPublicSiteCopy, resolvePublicSiteLocale } from "@/lib/public-site-copy";
import {
  getWebsiteBuilderPack,
  resolveWebsiteIndustryKey,
} from "@/lib/website-builder-industry";

export const revalidate = 120;

// ─── Contractor social proof stats (localized defaults) ───────────────
function getContractorStats(copy) {
  return [
    { number: copy.stats.freeQuote, label: copy.stats.noObligation },
    { number: copy.stats.licensed, label: copy.stats.licensedInsured },
    { number: copy.stats.topRated, label: copy.stats.topRatedLabel },
    { number: copy.stats.sameDay, label: copy.stats.sameDayLabel },
  ];
}

function normalizePublicCta(value, fallback) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;

  const compact = trimmed
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ");

  const looksLikeMarketingTrialCta =
    compact.includes("trial") ||
    compact.includes("start now") ||
    (compact.includes("free") && compact.includes("day"));

  return looksLikeMarketingTrialCta ? fallback : trimmed;
}

// ─── Wave divider (same as landing) ───────────────────────────────────
function WaveDivider({ fromColor, toColor }) {
  return (
    <div style={{ height: 60, background: toColor, overflow: "hidden", position: "relative" }}>
      <svg
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <path d="M0 0 Q300 60 600 30 Q900 0 1200 40 L1200 0 Z" fill={fromColor} />
      </svg>
    </div>
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getPublicWebsiteBySlug(slug);

  if (!data) return { title: "Contractor" };

  return buildPublicSiteMetadata(data, { page: "home" });
}

export default async function PublicContractorSitePage({ params }) {
  const { slug } = await params;
  const requestHref = `/sites/${slug}/request`;
  const quoteFormHref = `#request-service`;

  const data = await getPublicWebsiteBySlug(slug);

  if (!data) notFound();

  let publicReviews = [];
  let reviewStats = null;
  try {
    ({ reviews: publicReviews, stats: reviewStats } = await getPublicReviewsBySlug(slug));
  } catch (error) {
    console.error("[public-site] reviews load failed", error?.message || error);
  }

  const locale = resolvePublicSiteLocale(data.companyProfile?.documentLanguage);
  const copy = getPublicSiteCopy(locale);
  const theme = data.themeColor || "#1d4ed8";
  const headline = data.headline || "";
  const subheadline = data.subheadline || "";
  const aboutText = data.aboutText || "";
  const ctaText = normalizePublicCta(data.ctaText, copy.hero.requestEstimate);

  const companyName =
    data.companyProfile?.publicDisplayName || data.companyProfile?.companyName || "";
  const phone = data.companyProfile?.phone || "";
  const logoUrl =
    data.companyProfile?.resolvedLogoUrl ||
    resolveCompanyLogoUrl(data.companyProfile);
  const industryProfile = getIndustryProfile(data.companyProfile?.businessType || "");
  const industryPack = getWebsiteBuilderPack(
    resolveWebsiteIndustryKey(data.companyProfile?.businessType),
  );
  const requestServiceOptions = resolveWebsiteRequestServices({
    services: data.services,
    requestServices: data.requestServices,
    industryKey: data.industryKey,
    businessType: data.companyProfile?.businessType || "",
  });
  const jsonLd = buildLocalBusinessJsonLd(data);
  let services = filterHomeownerFacingServices(
    Array.isArray(data.services) && data.services.length > 0
      ? data.services
      : (industryProfile.websiteServices || []).map((name) => ({
          name,
          description: "",
          price: "",
        })),
  );
  if (!services.length && data.industryKey === "landscaping_hardscaping") {
    services = LANDSCAPING_DEFAULT_SERVICES.map((s) => ({ ...s }));
  }
  const galleryPhotos = Array.isArray(data.galleryPhotos) ? data.galleryPhotos : [];
  const heroDisplayPhotos =
    Array.isArray(data.heroPhotos) && data.heroPhotos.length > 0
      ? data.heroPhotos
      : galleryPhotos.slice(0, 4);
  const trustBadges = Array.isArray(data.trustBadges) ? data.trustBadges : [];
  const statTiles =
    trustBadges.length > 0
      ? trustBadges.slice(0, 4).map((badge) => ({
          number: badge,
          label: data.industryLabel || industryProfile.label,
        }))
      : getContractorStats(copy);

  const displayServices = services;

  return (
    <PublicSiteLeadExperience
      slug={data.slug}
      serviceOptions={requestServiceOptions}
      locale={locale}
      themeColor={theme}
      companyName={companyName}
    >
      <PublicSiteAnalytics analytics={data.analytics} />
      <PublicSiteScrollNav />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; }
        #services, #about, #gallery, #reviews, #request-service, #contact {
          scroll-margin-top: 88px;
        }

        /* ── Navbar (identical to landing) ── */
        .s-nav { position: sticky; top: 0; z-index: 100; background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; gap: 12px; }
        .s-logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 20px; color: #fff; letter-spacing: -0.5px; text-decoration: none; }
        .s-logo-icon { width: 32px; height: 32px; border-radius: 6px; background: var(--theme); display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
        .s-logo-icon img { width: 100%; height: 100%; object-fit: contain; }
        .s-nav-links { display: flex; align-items: center; gap: 24px; font-size: 14px; }
        .s-nav-links a { color: #94a3b8; text-decoration: none; font-weight: 600; transition: color 0.15s; }
        .s-nav-links a:hover { color: #fff; }
        .s-nav-cta { background: var(--theme); color: #fff !important; padding: 8px 20px; border-radius: 6px; font-weight: 700; font-size: 14px; text-decoration: none; white-space: nowrap; }
        .s-nav-cta:hover { filter: brightness(1.1); }

        /* ── Hero (identical to landing) ── */
        .s-hero { background: #1e293b; color: #fff; padding: 64px 24px 0; }
        .s-hero-inner { max-width: 1280px; margin: 0 auto; display: flex; align-items: flex-start; gap: 64px; }
        .s-hero-left { flex: 1; padding-bottom: 48px; }
        .s-hero-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(29,78,216,0.2); color: #93c5fd; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700; margin-bottom: 20px; }
        .s-hero h1 { font-size: clamp(2.2rem, 5vw, 3.75rem); font-weight: 900; line-height: 1.1; letter-spacing: -2px; margin-bottom: 24px; }
        .s-hero-sub { font-size: 18px; color: #94a3b8; line-height: 1.65; max-width: 480px; margin-bottom: 16px; }
        .s-hero-pill { display: inline-block; background: rgba(29,78,216,0.15); color: #93c5fd; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; margin-bottom: 32px; }
        .s-hero-btns { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 32px; }
        .s-btn-primary { background: var(--theme); color: #fff; padding: 14px 32px; border-radius: 6px; font-weight: 800; font-size: 16px; text-decoration: none; transition: filter 0.18s; }
        .s-btn-primary:hover { filter: brightness(1.12); }
        .s-btn-secondary { background: rgba(255,255,255,0.1); color: #fff; padding: 14px 28px; border-radius: 6px; font-weight: 700; font-size: 16px; text-decoration: none; transition: background 0.18s; }
        .s-btn-secondary:hover { background: rgba(255,255,255,0.2); }
        .s-hero-proof { display: flex; gap: 24px; flex-wrap: wrap; }
        .s-proof-item { display: flex; align-items: center; gap: 8px; }
        .s-proof-item .s-p-num { font-weight: 700; font-size: 15px; color: #fff; }
        .s-proof-item .s-p-label { font-size: 13px; color: #64748b; }
        .s-hero-right { flex: 1; max-width: 580px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-bottom: 0; min-width: 0; }
        .s-hero-photo { position: relative; padding-bottom: 65%; border-radius: 12px; overflow: hidden; }
        .s-hero-photo-caption { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 10px; background: linear-gradient(to top, rgba(0,0,0,0.7), transparent); color: #fff; font-size: 11px; font-weight: 600; }

        /* ── Stats bar (identical to landing) ── */
        .s-stats { background: #1e293b; padding: 24px 24px 56px; }
        .s-stats-grid { max-width: 1280px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .s-stat-tile { background: #1e3a5f; border-radius: 12px; padding: 20px; text-align: center; }
        .s-stat-num { font-size: 2rem; font-weight: 900; color: #fff; margin-bottom: 4px; }
        .s-stat-label { font-size: 13px; color: #64748b; }

        .s-section-eyebrow { text-align: center; font-size: clamp(1.8rem, 3.5vw, 2.75rem); font-weight: 900; color: #1e293b; letter-spacing: -1px; margin-bottom: 14px; }
        .s-section-sub { text-align: center; font-size: 17px; color: #6b7280; max-width: 560px; margin: 0 auto 56px; }

        /* ── About (identical to landing's eff6ff bg sections) ── */
        .s-about { background: #eff6ff; padding: 64px 24px; }
        .s-about-inner { max-width: 800px; }
        .s-about-inner p { font-size: 18px; line-height: 1.8; color: #334155; }

        /* ── Testimonials (identical to landing) ── */
        .s-testimonials { background: #eff6ff; padding: 16px 24px 64px; }
        .s-test-grid { max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        .s-test-card { background: #fff; border-radius: 20px; padding: 36px 32px; box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
        .s-test-quote { font-size: 17px; font-weight: 500; color: #1e293b; line-height: 1.6; margin-bottom: 24px; }
        .s-test-author { display: flex; align-items: center; gap: 12px; }
        .s-test-avatar { width: 40px; height: 40px; border-radius: 999px; background: #1e293b; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; }
        .s-test-name { font-weight: 700; font-size: 14px; color: #1e293b; }
        .s-test-co { font-size: 12px; color: #6b7280; }

        /* ── Dark CTA / Pricing (identical to landing) ── */
        .s-cta { background: #1e293b; padding: 80px 24px; text-align: center; }
        .s-cta-inner { max-width: 640px; margin: 0 auto; }
        .s-cta h2 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 900; color: #fff; letter-spacing: -1.5px; margin-bottom: 20px; }
        .s-cta-sub { font-size: 18px; color: #94a3b8; margin-bottom: 12px; }
        .s-cta-phone { font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 900; color: #fff; text-decoration: none; letter-spacing: -1px; display: block; margin-bottom: 36px; }
        .s-cta-phone:hover { opacity: 0.88; }

        /* ── Footer ── */
        .s-footer { background: #0f172a; color: rgba(255,255,255,0.5); text-align: center; padding: 28px 24px; font-size: 14px; }
        .s-footer a { color: rgba(255,255,255,0.7); text-decoration: none; }
        .s-footer a:hover { color: #fff; }

        /* ── Contact row ── */
        .s-contact-row { max-width: 1200px; margin: 0 auto; display: flex; gap: 16px; flex-wrap: wrap; }
        .s-contact-chip { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 12px 20px; color: #94a3b8; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .s-contact-chip strong { color: #fff; }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .s-hero-inner { flex-direction: column; gap: 32px; }
          .s-hero-right { max-width: 100%; width: 100%; }
          .s-features-grid { grid-template-columns: 1fr 1fr; }
          .s-gallery-grid { grid-template-columns: 1fr 1fr; }
          .s-stats-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 600px) {
          .s-nav-links { display: none; }
          .s-hero { padding: 56px 16px 0; }
          .ps-services-grid { grid-template-columns: 1fr; }
          .s-test-grid { grid-template-columns: 1fr; }
          .s-stats-grid { grid-template-columns: 1fr 1fr; }
          .s-cta { padding: 64px 16px; }
        }
      `}</style>

      <div style={{ "--theme": theme }}>
        {/* ── Navbar ── */}
        {jsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        ) : null}

        <PublicSiteNav
          slug={slug}
          companyName={companyName}
          logoUrl={logoUrl}
          phone={phone}
          ctaText={ctaText}
          themeColor={theme}
          requestHref={quoteFormHref}
          locale={locale}
        />

        {/* ── Hero ── */}
        <PublicSiteEnhancements stickyCtaHref={quoteFormHref} stickyCtaLabel={ctaText} />

        <section className="s-hero ps-reveal ps-visible" id={PUBLIC_SITE_SECTIONS.home}>
          <div className="s-hero-inner">
            <div className="s-hero-left">
              <div className="s-hero-badge">
                ⭐ {industryProfile.label} · {copy.hero.licensedInsured}
              </div>
              <h1>{headline || `Professional ${industryProfile.label}`}</h1>
              <p className="s-hero-sub">{subheadline || `Quality ${industryProfile.label.toLowerCase()} services you can count on. Licensed, insured, and trusted by local homeowners and businesses.`}</p>
              <p className="s-hero-pill">🎉 {copy.hero.freeEstimates}</p>
              <div className="s-hero-btns">
                <a href={quoteFormHref} className="s-btn-primary">
                  {ctaText}
                </a>
                <a href="#services" className="s-btn-secondary">{copy.hero.ourServices}</a>
              </div>
              {trustBadges.length > 1 ? (
                <div className="s-hero-proof" style={{ gap: 8, flexWrap: "wrap" }}>
                  {trustBadges.slice(1, 4).map((badge) => (
                    <span
                      key={badge}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        color: "#cbd5e1",
                      }}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {heroDisplayPhotos.length > 0 ? (
              <div className="s-hero-right">
                {heroDisplayPhotos.map((photo, i) => (
                  <div key={photo.id || `hero-${i}`} className="s-hero-photo">
                    {String(photo.src || "").trim() ? (
                      <img
                        src={photo.src}
                        alt={photo.alt || `${industryProfile.label} photo ${i + 1}`}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={i === 0 ? "high" : "low"}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : null}
                    <div className="s-hero-photo-caption">{photo.alt || industryProfile.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Stats bar ── */}
        <section className="s-stats ps-reveal ps-reveal-delay-1">
          <div className="s-stats-grid">
            {statTiles.map((stat) => (
              <div key={stat.number} className="s-stat-tile">
                <div className="s-stat-num">{stat.number}</div>
                <div className="s-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <WaveDivider fromColor="#1e293b" toColor="#ffffff" />

        <PublicServicesSection
          services={displayServices}
          themeColor={theme}
          quoteHref={quoteFormHref}
          title={copy.services.title}
          subtitle={
            data.industryKey === "landscaping_hardscaping"
              ? "From weekly lawn care to custom patios, retaining walls, and drainage — every project starts with a free on-site estimate."
              : copy.services.subtitle
          }
          quoteLabel={
            data.industryKey === "landscaping_hardscaping"
              ? "Request Quote"
              : copy.services.getQuote
          }
          galleryPhotos={galleryPhotos}
        />

        <WaveDivider fromColor="#ffffff" toColor="#eff6ff" />

        {/* ── About (anchor always present for nav) ── */}
        <section className="s-about ps-reveal" id={PUBLIC_SITE_SECTIONS.about}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div className="s-about-inner">
              <h2 style={{ fontSize: "clamp(1.8rem,3.5vw,2.5rem)", fontWeight: 900, color: "#1e293b", letterSpacing: "-1px", marginBottom: 20 }}>
                {fillPublicSiteTemplate(copy.about.title, { company: companyName })}
              </h2>
              {aboutText ? (
                <p>{aboutText}</p>
              ) : (
                <p style={{ color: "#64748b" }}>
                  {fillPublicSiteTemplate(copy.about.fallback, { company: companyName })}
                </p>
              )}
              <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap" }}>
                {phone ? (
                  <a href={`tel:${phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1e293b", color: "#fff", padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
                    📞 {phone}
                  </a>
                ) : null}
                <a
                  href={quoteFormHref}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: phone ? "#ffffff" : "#1e293b",
                    color: phone ? "#1e293b" : "#fff",
                    border: phone ? "1px solid #cbd5e1" : "none",
                    padding: "10px 20px",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 15,
                    textDecoration: "none",
                  }}
                >
                  {copy.about.requestQuote}
                </a>
              </div>
            </div>
          </div>
        </section>

        <PremiumGallery
          photos={galleryPhotos}
          portfolio={data.portfolio}
          title={copy.gallery.title}
          subtitle={fillPublicSiteTemplate(copy.gallery.subtitle, {
            company: companyName || (locale === "es" ? "nuestro equipo" : "our team"),
          })}
          emptyTitle={copy.gallery.emptyTitle || "Project photos coming soon"}
          emptyBody={
            copy.gallery.emptyBody ||
            "Upload portfolio photos in Website Builder to showcase patios, lawns, and hardscape projects."
          }
        />

        {publicReviews.length > 0 ? (
          <PublicReviewsSection
            reviews={publicReviews}
            stats={reviewStats}
            title="Customer reviews"
            subtitle={fillPublicSiteTemplate(copy.gallery.subtitle, {
              company: companyName || "our team",
            })}
          />
        ) : null}

        {publicReviews.length === 0 ? (
          <PublicReviewsCta
            googleUrl={data.socialLinks?.google || data.companyProfile?.googleReviewsUrl}
            yelpUrl={data.socialLinks?.yelp}
            title={locale === "es" ? "Reseñas verificadas" : "Verified reviews"}
            subtitle={
              locale === "es"
                ? "Lee opiniones reales en Google y Yelp."
                : "Read real customer reviews on Google and Yelp."
            }
          />
        ) : null}

        <WaveDivider fromColor="#eff6ff" toColor="#1e293b" />

        {/* ── CTA / Request Service (dark, like landing's pricing section) ── */}
        <section className="s-cta ps-visible" id={PUBLIC_SITE_SECTIONS.requestService}>
          <div className="s-cta-inner">
            <h2>
              {phone ? copy.cta.callToday : copy.cta.getQuote}
              <br />
              {copy.cta.respondFast}
            </h2>
            <p className="s-cta-sub">{copy.cta.noObligation}</p>
            {phone && (
              <a href={`tel:${phone}`} className="s-cta-phone">
                {phone}
              </a>
            )}
            <RequestServiceForm
              slug={data.slug}
              serviceOptions={requestServiceOptions}
              locale={locale}
              themeColor={theme}
            />
          </div>

          {/* Contact details row */}
          <div id={PUBLIC_SITE_SECTIONS.contact} style={{ marginTop: 48 }}>
            <div className="s-contact-row" style={{ justifyContent: "center" }}>
              {phone && (
                <div className="s-contact-chip">
                  <span>📞</span>
                  <span><strong>{phone}</strong></span>
                </div>
              )}
              <div className="s-contact-chip">
                <span>🏷️</span>
                <span>{industryProfile.label}</span>
              </div>
              <div className="s-contact-chip">
                <span>📝</span>
                <span>{copy.cta.contactForm}</span>
              </div>
            </div>
          </div>
        </section>

        <PublicSiteFooter
          slug={data.slug}
          companyName={companyName}
          logoUrl={logoUrl}
          phone={phone}
          businessAddress={data.companyProfile?.businessAddress || ""}
          socialLinks={data.socialLinks || {}}
          googleReviewsUrl={data.companyProfile?.googleReviewsUrl || ""}
          themeColor={theme}
          locale={locale}
        />
      </div>
    </PublicSiteLeadExperience>
  );
}
