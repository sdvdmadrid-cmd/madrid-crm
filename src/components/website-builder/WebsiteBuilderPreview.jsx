"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./website-builder.module.css";
import LeadRequestModal from "@/components/site/LeadRequestModal";
import PremiumGallery from "@/components/site/PremiumGallery";
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
  requestServices,
  slug = "",
  locale = "en",
  onQuoteClick,
  editable = false,
  selectedSection = null,
  onSelectSection,
  onFieldChange,
  onServiceChange,
  onGenerateHeroSlot,
  generatingSlotId = "",
}) {
  const companyName =
    companyProfile?.publicDisplayName || companyProfile?.companyName || "Your Company";
  const logoUrl = String(companyProfile?.logoDataUrl || "").trim();
  const trustBadges = form.trustBadges || [];
  const testimonials = form.testimonials || [];
  const heroSlots = Array.isArray(form.heroPhotos) ? form.heroPhotos : [];
  const heroWithSrc = heroSlots.filter((p) => p?.src);
  const heroPhotos =
    heroWithSrc.length > 0
      ? heroWithSrc
      : form.galleryPhotos?.length > 0
        ? form.galleryPhotos.slice(0, 4)
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

  useEffect(() => {
    const root = document.querySelector("[data-preview-root]");
    root?.querySelectorAll(".ps-reveal").forEach((node) => node.classList.add("ps-visible"));

    const onOpen = () => openQuoteForm();
    window.addEventListener("fieldbase:open-lead-form", onOpen);
    return () => window.removeEventListener("fieldbase:open-lead-form", onOpen);
  }, [openQuoteForm]);

  return (
    <div
      data-preview-root
      className={`${styles.previewRoot} ${editable ? styles.previewRootEditable : ""}`}
      style={{ "--theme": theme }}
      onClick={() => editable && onSelectSection?.(null)}
    >
      <PreviewPremiumStyles />
      <div className="preview-nav">
        <div className="preview-logo">
          <div className="preview-logo-icon">
            {logoUrl ? (
              <img src={logoUrl} alt="" className={styles.previewLogoImg} />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                <path
                  d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          {companyName}
        </div>
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
        <div className="preview-hero">
          <div className="preview-hero-inner">
            <div className="preview-hero-left">
              <div className="preview-badge">
                {trustBadges[0] || `⭐ Licensed ${industryLabel || "contractor"}`}
              </div>
              <h1>
                <InlineEditable
                  asHeading
                  value={form.headline}
                  onChange={editable ? (v) => patch("headline", v) : null}
                  placeholder="Your headline"
                  maxLength={200}
                  className={styles.inlineOnDark}
                />
              </h1>
              <p className="preview-hero-sub">
                <InlineEditable
                  multiline
                  value={form.subheadline}
                  onChange={editable ? (v) => patch("subheadline", v) : null}
                  placeholder="Your subheadline"
                  maxLength={300}
                  className={styles.inlineOnDark}
                />
              </p>
              {trustBadges.length > 1 ? (
                <div className="preview-trust-row">
                  {trustBadges.slice(1, 5).map((badge) => (
                    <span key={badge} className="preview-trust-pill">
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="preview-hero-pill">🎉 Free estimates — same-day response</p>
              <div className="preview-hero-actions">
                <QuoteCtaButton className="preview-btn-primary" onOpenQuote={openQuoteForm}>
                  {ctaLabel}
                </QuoteCtaButton>
                <button
                  type="button"
                  className="preview-btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById("preview-services")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                >
                  Our Services
                </button>
              </div>
              {editable ? (
                <p className={styles.previewCtaEditHint}>
                  CTA button text: edit in Advanced → Brand & CTA
                </p>
              ) : null}
            </div>
            <div className="preview-hero-right">
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
                              if (!photo?.src && onGenerateHeroSlot) onGenerateHeroSlot(index);
                            }
                          : undefined
                      }
                    >
                      {photo?.src ? (
                        <img src={photo.src} alt={photo.alt || "Project photo"} />
                      ) : (
                        <div className={styles.photoPlaceholder}>
                          {generatingSlotId === photo?.id
                            ? "Generating…"
                            : editable
                              ? "Click to generate"
                              : "Photo"}
                        </div>
                      )}
                    </div>
                  ))
                : null}
            </div>
          </div>
        </div>
      </PreviewSection>

      <div className="preview-features" id="preview-services">
        <div className="preview-features-title">Our Services</div>
        <div className="preview-features-grid">
          {(form.services || []).slice(0, 6).map((service, index) => (
            <div key={`${service.name}-${index}`} className="preview-feature-card">
              <div className="preview-feature-title">
                <InlineEditable
                  value={service.name}
                  onChange={editable ? (v) => onServiceChange?.(index, "name", v) : null}
                  placeholder="Service name"
                  maxLength={100}
                />
              </div>
              <p className="preview-feature-desc">
                <InlineEditable
                  multiline
                  value={service.description}
                  onChange={editable ? (v) => onServiceChange?.(index, "description", v) : null}
                  placeholder="Service description"
                  maxLength={400}
                />
              </p>
              <button
                type="button"
                className="preview-feat-link"
                onClick={(e) => {
                  e.stopPropagation();
                  openQuoteForm();
                }}
              >
                Get a quote →
              </button>
            </div>
          ))}
        </div>
      </div>

      <PreviewSection
        sectionId="about"
        label="About"
        editable={editable}
        selected={selectedSection === "about"}
        onSelect={onSelectSection}
      >
        <div className="preview-about">
          <h2>About {companyName}</h2>
          <p>
            <InlineEditable
              multiline
              value={form.aboutText}
              onChange={editable ? (v) => patch("aboutText", v) : null}
              placeholder="Tell customers about your company…"
              maxLength={2000}
            />
          </p>
        </div>
      </PreviewSection>

      <PreviewSection
        sectionId="gallery"
        label="Gallery"
        editable={editable}
        selected={selectedSection === "gallery"}
        onSelect={onSelectSection}
      >
        {form.galleryPhotos.length > 0 ? (
          <div className="preview-gallery" onClick={(e) => e.stopPropagation()}>
            <PremiumGallery
              photos={form.galleryPhotos}
              title="Recent Work"
              subtitle="Tap any photo to preview fullscreen — same as your live site."
              useNextImage={false}
            />
          </div>
        ) : (
          <div className={styles.galleryEmptyVisual}>
            {editable ? "Select Gallery in advanced panel or regenerate site for photos." : null}
          </div>
        )}
      </PreviewSection>

      {testimonials.length > 0 ? (
        <PreviewSection
          sectionId="trust"
          label="Reviews"
          editable={editable}
          selected={selectedSection === "trust"}
          onSelect={onSelectSection}
        >
          <div className="preview-testimonials">
            <div className="preview-test-grid">
              {testimonials.slice(0, 2).map((item, index) => (
                <div key={`${item.name}-${index}`} className="preview-test-card">
                  <p className="preview-test-quote">&ldquo;{item.quote}&rdquo;</p>
                  <strong style={{ fontSize: 12, color: "#1e293b" }}>{item.name}</strong>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{item.role}</div>
                </div>
              ))}
            </div>
          </div>
        </PreviewSection>
      ) : null}

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
        &copy; {new Date().getFullYear()} {companyName}. Powered by FieldBase
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
