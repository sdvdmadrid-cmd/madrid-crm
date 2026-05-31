"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveCompanyLogoUrl } from "@/lib/resolve-company-logo-url";
import { getCompanyDisplayName } from "@/lib/website-builder-company";
import {
  LANDSCAPING_TRUST_BADGES,
  resolveMarketingHeadline,
  sanitizeWebsiteTestimonials,
} from "@/lib/website-content-purity";
import {
  PUBLIC_SITE_SECTIONS,
  handlePublicSiteNavClick,
  scrollToPublicSiteSection,
} from "@/lib/public-site-navigation";
import styles from "./website-builder.module.css";
import CompanyBrandMark from "./CompanyBrandMark";
import LeadRequestModal from "@/components/site/LeadRequestModal";
import PremiumGallery from "@/components/site/PremiumGallery";
import PublicServicesSection from "@/components/site/PublicServicesSection";
import {
  normalizeGalleryPhotos,
  resolvePublicGalleryPhotos,
} from "@/lib/website-gallery";
import PremiumLeadForm from "@/components/site/PremiumLeadForm";
import PreviewPremiumStyles from "@/components/site/PreviewPremiumStyles";
import {
  InlineEditable,
  PreviewSection,
} from "./WebsiteBuilderInlineEditable";

const SECTION_REGEN_MAP = {
  hero: "hero",
  about: "hero",
  services: "services",
  trust: "trust",
  stats: "trust",
  gallery: "services",
};

const DEFAULT_TRUST_BADGES = LANDSCAPING_TRUST_BADGES;

function QuoteCtaButton({ children, className, onQuoteClick, onOpenQuote }) {
  const handler = onOpenQuote || onQuoteClick;
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        handler?.();
      }}
    >
      {children}
    </button>
  );
}

export default function WebsiteBuilderPreview({
  theme,
  form,
  companyProfile,
  industryLabel,
  industryKey = "",
  requestServices,
  slug = "",
  locale = "en",
  onQuoteClick,
  editable = false,
  selectedSection = null,
  onSelectSection,
  onGalleryUploadClick,
  onFieldChange,
  onServiceChange,
  onGenerateHeroSlot,
  generatingSlotId = "",
  portfolio = null,
  reviewsEmptyTitle = "No reviews published yet.",
  reviewsEmptyBody = "Connect Google, Facebook, or another review source to show verified customer testimonials on your live site.",
}) {
  const companyName = getCompanyDisplayName(companyProfile) || "Your Company";
  const logoUrl = resolveCompanyLogoUrl(companyProfile);
  const phone = String(companyProfile?.phone || "").trim();

  const displayHeadline = useMemo(
    () =>
      resolveMarketingHeadline(
        form.headline,
        companyName,
        "Outdoor spaces that wow.",
      ),
    [form.headline, companyName],
  );

  const trustBadges = useMemo(() => {
    const fromForm = (form.trustBadges || [])
      .map((b) => String(b || "").trim())
      .filter(Boolean);
    return fromForm.length >= 2 ? fromForm.slice(0, 4) : DEFAULT_TRUST_BADGES;
  }, [form.trustBadges]);

  const verifiedTestimonials = useMemo(
    () => sanitizeWebsiteTestimonials(form.testimonials),
    [form.testimonials],
  );

  const heroSlots = Array.isArray(form.heroPhotos) ? form.heroPhotos : [];
  const heroWithSrc = heroSlots.filter((p) => p?.src);
  const galleryPhotos = useMemo(() => {
    if (editable) {
      return normalizeGalleryPhotos(form.galleryPhotos);
    }
    return resolvePublicGalleryPhotos(form.galleryPhotos, portfolio);
  }, [form.galleryPhotos, portfolio, editable]);
  const heroPhotos =
    heroWithSrc.length > 0
      ? heroWithSrc
      : galleryPhotos.length > 0
        ? galleryPhotos.slice(0, 4)
        : [];

  const patch = onFieldChange || (() => {});
  const ctaLabel = String(form.ctaText || "").trim() || "Get your free quote";
  const [leadModalOpen, setLeadModalOpen] = useState(false);

  const openQuoteForm = useCallback(() => {
    setLeadModalOpen(true);
    const el = document.getElementById("preview-request-form");
    if (el) {
      el.classList.add("ps-visible", "ps-quote-highlight");
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => el.classList.remove("ps-quote-highlight"), 2400);
    }
    onQuoteClick?.();
  }, [onQuoteClick]);

  const resolvePreviewAnchorId = useCallback((sectionId) => {
    const id = String(sectionId || "").replace(/^#/, "");
    if (id === PUBLIC_SITE_SECTIONS.requestService || id === PUBLIC_SITE_SECTIONS.contact) {
      return "preview-request-form";
    }
    return id;
  }, []);

  const scrollToSection = useCallback(
    (sectionId) => {
      scrollToPublicSiteSection(resolvePreviewAnchorId(sectionId), {
        offset: 96,
      });
    },
    [resolvePreviewAnchorId],
  );

  useEffect(() => {
    const root = document.querySelector("[data-preview-root]");
    root?.querySelectorAll(".ps-reveal").forEach((node) => node.classList.add("ps-visible"));

    const onOpen = () => openQuoteForm();
    window.addEventListener("fieldbase:open-lead-form", onOpen);

    const onNavClick = (event) => {
      const anchor = event.target.closest?.("a[href^='#']");
      if (anchor) {
        const hash = anchor.getAttribute("href")?.replace(/^#/, "") || "";
        const targetId = resolvePreviewAnchorId(hash);
        if (document.getElementById(targetId)) {
          event.preventDefault();
          event.stopPropagation();
          scrollToSection(targetId);
          if (
            targetId === "preview-request-form" ||
            hash === PUBLIC_SITE_SECTIONS.requestService
          ) {
            openQuoteForm({ skipScroll: true });
          }
          return;
        }
      }

      const btn = event.target.closest?.("[data-preview-nav]");
      if (!btn) return;
      const section = btn.getAttribute("data-preview-nav");
      if (!section) return;
      event.preventDefault();
      if (section === "preview-request-form") {
        scrollToSection(section);
        openQuoteForm({ skipScroll: true });
        return;
      }
      scrollToSection(section);
    };

    const rootEl = document.querySelector("[data-preview-root]");
    rootEl?.addEventListener("click", onNavClick, true);

    return () => {
      window.removeEventListener("fieldbase:open-lead-form", onOpen);
      rootEl?.removeEventListener("click", onNavClick, true);
    };
  }, [openQuoteForm, scrollToSection]);

  return (
    <div
      data-preview-root
      data-builder-preview=""
      className={`${styles.previewRoot} ${editable ? styles.previewRootEditable : ""}`}
      style={{ "--theme": theme }}
      onClick={() => editable && onSelectSection?.(null)}
    >
      <PreviewPremiumStyles />
      <div className="preview-nav">
        <CompanyBrandMark
          logoUrl={logoUrl}
          companyName={companyName}
          themeColor={theme}
          variant="nav"
          animate
          showName={false}
          logoFill
        />
        <div className="preview-nav-links">
          <button type="button" className={styles.previewNavLinkBtn} onClick={() => openQuoteForm()}>
            Services
          </button>
          <button type="button" className={styles.previewNavLinkBtn} onClick={() => openQuoteForm()}>
            Contact
          </button>
        </div>
        <QuoteCtaButton className="preview-nav-cta" onOpenQuote={openQuoteForm}>
          {ctaLabel}
        </QuoteCtaButton>
      </div>

      <PreviewSection
        sectionId="hero"
        label="Hero"
        editable={editable}
        selected={selectedSection === "hero"}
        onSelect={onSelectSection}
        className="preview-hero-wrap"
      >
        <div className={`preview-hero ${styles.previewHeroPremium}`}>
          <div className={styles.previewHeroStack}>
            <CompanyBrandMark
              logoUrl={logoUrl}
              companyName={companyName}
              themeColor={theme}
              variant="heroCenter"
              animate
              showName
              logoFill
            />
            <h1 className={styles.previewHeroHeadline}>
              <InlineEditable
                asHeading
                value={displayHeadline}
                onChange={
                  editable
                    ? (v) => patch("headline", v)
                    : null
                }
                placeholder="Your headline"
                maxLength={200}
                className={styles.inlineOnDark}
              />
            </h1>
            <p className={`preview-hero-sub ${styles.previewHeroSubCentered}`}>
              <InlineEditable
                multiline
                value={form.subheadline}
                onChange={editable ? (v) => patch("subheadline", v) : null}
                placeholder="Your subheadline"
                maxLength={300}
                className={styles.inlineOnDark}
              />
            </p>
            <div className={`preview-trust-row ${styles.previewTrustRowHero}`}>
              {trustBadges.map((badge) => (
                <span key={badge} className="preview-trust-pill">
                  {badge}
                </span>
              ))}
            </div>
            <div className={`preview-hero-actions ${styles.previewHeroActionsCentered}`}>
              <QuoteCtaButton className="preview-btn-primary" onOpenQuote={openQuoteForm}>
                {ctaLabel}
              </QuoteCtaButton>
              <a
                href={`#${PUBLIC_SITE_SECTIONS.services}`}
                className="preview-btn-secondary"
                data-preview-nav={PUBLIC_SITE_SECTIONS.services}
                onClick={(e) => e.stopPropagation()}
              >
                Our Services
              </a>
            </div>
          </div>

          {heroPhotos.length > 0 ? (
            <div className={styles.previewHeroMedia}>
              {heroSlots.length > 0
                ? heroSlots.map((photo, index) => (
                    <div
                      key={`hero-${index}`}
                      className={`preview-photo-card ${editable ? styles.photoCardEditable : ""}`}
                      onClick={
                        editable
                          ? (e) => {
                              e.stopPropagation();
                              onSelectSection?.("gallery");
                            }
                          : undefined
                      }
                    >
                      {photo?.src ? (
                        <img src={photo.src} alt={photo.alt || "Project photo"} />
                      ) : (
                        <div className={styles.photoPlaceholder}>Photo</div>
                      )}
                    </div>
                  ))
                : heroPhotos.map((photo, index) => (
                    <div key={`hero-g-${index}`} className="preview-photo-card">
                      <img
                        src={photo.thumbnail || photo.src}
                        alt={photo.alt || "Project photo"}
                      />
                    </div>
                  ))}
            </div>
          ) : null}
        </div>
      </PreviewSection>

      <PublicServicesSection
        services={form.services || []}
        themeColor={theme}
        quoteHref="#preview-request-form"
        title="Our Services"
        subtitle={
          industryKey === "landscaping_hardscaping"
            ? "From weekly lawn care to custom patios, retaining walls, and drainage — every project starts with a free on-site estimate."
            : "Professional services tailored to your property — request a free estimate to get started."
        }
        quoteLabel={
          industryKey === "landscaping_hardscaping" ? "Request Quote" : ctaLabel
        }
        galleryPhotos={galleryPhotos}
        editable={editable}
        renderTitle={(service, index) => (
          <InlineEditable
            value={service.name}
            onChange={editable ? (v) => onServiceChange?.(index, "name", v) : null}
            placeholder="Service name"
            maxLength={100}
          />
        )}
        renderDescription={(service, index) => (
          <InlineEditable
            multiline
            value={service.description}
            onChange={editable ? (v) => onServiceChange?.(index, "description", v) : null}
            placeholder="Short description"
            maxLength={400}
          />
        )}
      />

      <PreviewSection
        sectionId="gallery"
        label="Gallery"
        editable={editable}
        selected={selectedSection === "gallery"}
        onSelect={onSelectSection}
      >
        <div className="preview-gallery" onClick={(e) => e.stopPropagation()}>
          <PremiumGallery
            photos={galleryPhotos}
            portfolio={portfolio}
            title="Recent Work"
            subtitle="Photos sync from your portfolio and featured gallery."
            emptyTitle="No project photos yet"
            emptyBody="Upload real photos of your completed projects so homeowners trust your work."
            builderEditable={editable}
            onUploadClick={editable ? onGalleryUploadClick : null}
            uploadLabel="Upload project photos"
          />
        </div>
      </PreviewSection>

      <PreviewSection
        sectionId="trust"
        label="Reviews"
        editable={editable}
        selected={selectedSection === "trust"}
        onSelect={onSelectSection}
      >
        {verifiedTestimonials.length > 0 ? (
          <div className="preview-testimonials">
            <div className="preview-test-grid">
              {verifiedTestimonials.slice(0, 2).map((item, index) => (
                <div key={`${item.name}-${index}`} className="preview-test-card">
                  <p className="preview-test-quote">&ldquo;{item.quote}&rdquo;</p>
                  <strong style={{ fontSize: 12, color: "#1e293b" }}>{item.name}</strong>
                  {item.platform ? (
                    <div style={{ fontSize: 11, color: "#6b7280" }}>via {item.platform}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.reviewsEmptyState}>
            <p className={styles.reviewsEmptyTitle}>{reviewsEmptyTitle}</p>
            <p className={styles.reviewsEmptyBody}>{reviewsEmptyBody}</p>
          </div>
        )}
      </PreviewSection>

      <div className="preview-cta-section">
        <h2>Ready for your free quote?</h2>
        <p style={{ color: "#94a3b8", marginBottom: 16, fontSize: 14 }}>
          Customers fill out a short job request — service, details, and contact info.
        </p>
        <QuoteCtaButton className="preview-cta-btn" onOpenQuote={openQuoteForm}>
          {ctaLabel} →
        </QuoteCtaButton>
      </div>

      <div id="preview-request-form" className="preview-request-shell ps-reveal ps-visible">
        <div className="preview-request-card preview-request-cardPremium">
          <p className="preview-request-eyebrow">Job request form · Live on your public site</p>
          <h3>Request a quote</h3>
          <p className="preview-request-sub">
            This is what homeowners use to describe their project and contact you.
          </p>
          {slug ? (
            <PremiumLeadForm
              slug={slug}
              serviceOptions={requestServices}
              themeColor={theme}
              locale={locale}
              liveSubmit={false}
            />
          ) : (
            <div className={styles.previewFormPlaceholder}>
              <p>Save your website once to activate the quote form for customers.</p>
              <QuoteCtaButton className="preview-cta-btn preview-cta-btnLarge" onOpenQuote={openQuoteForm}>
                {ctaLabel}
              </QuoteCtaButton>
            </div>
          )}
        </div>
      </div>

      <div className="preview-footer">
        <CompanyBrandMark
          logoUrl={logoUrl}
          companyName={companyName}
          themeColor={theme}
          variant="footer"
          showName={false}
          logoFill
          phone={phone}
        />
        <p className={styles.previewFooterLegal}>
          &copy; {new Date().getFullYear()} {companyName}. Powered by FieldBase
        </p>
      </div>

      <LeadRequestModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        slug={slug}
        serviceOptions={requestServices}
        locale={locale}
        themeColor={theme}
        companyName={companyName}
      />
    </div>
  );
}

export { SECTION_REGEN_MAP };
