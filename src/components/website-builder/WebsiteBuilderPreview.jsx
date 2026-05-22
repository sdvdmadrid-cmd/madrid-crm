"use client";

import styles from "./website-builder.module.css";

export default function WebsiteBuilderPreview({
  theme,
  form,
  companyProfile,
  industryLabel,
  requestServices,
  requestUrl,
  canOpenRequestPage,
  onRequestBlocked,
}) {
  const companyName =
    companyProfile?.publicDisplayName || companyProfile?.companyName || "Your Company";
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

  return (
    <div className={styles.previewRoot} style={{ "--theme": theme }}>
      <div className="preview-nav">
        <div className="preview-logo">
          <div className="preview-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
              <path
                d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                stroke="#fff"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {companyName}
        </div>
        <div className="preview-nav-links">
          <span>Services</span>
          <span>About</span>
          <span>Contact</span>
        </div>
        {companyProfile?.phone ? (
          <span className="preview-nav-cta">{companyProfile.phone}</span>
        ) : (
          <a href="#preview-request-form" className="preview-nav-cta">
            Get a Quote
          </a>
        )}
      </div>

      <div className="preview-hero">
        <div className="preview-hero-inner">
          <div className="preview-hero-left">
            <div className="preview-badge">
              {trustBadges[0] || `⭐ Licensed ${industryLabel || "contractor"}`}
            </div>
            <h1>{form.headline || "Your professional home service team"}</h1>
            <p className="preview-hero-sub">
              {form.subheadline ||
                `Quality ${(industryLabel || "contractor").toLowerCase()} services you can trust.`}
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
              <a href="#preview-request-form" className="preview-btn-primary">
                {form.ctaText || "Get a quote"}
              </a>
              <a href="#preview-services" className="preview-btn-secondary">
                Our Services
              </a>
            </div>
          </div>
          <div className="preview-hero-right">
            {heroPhotos.length > 0
              ? heroPhotos.map((photo, index) => (
                  <div key={`hero-${index}`} className="preview-photo-card">
                    <img src={photo.src} alt={photo.alt || "Project photo"} />
                  </div>
                ))
              : [1, 2, 3, 4].map((n) => (
                  <div key={n} className="preview-photo-card">
                    <div
                      style={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        color: "#94a3b8",
                        padding: 8,
                        textAlign: "center",
                      }}
                    >
                      Add hero image {n}
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </div>

      <div className="preview-stats">
        <div className="preview-stats-grid">
          {(trustBadges.length > 0
            ? trustBadges.slice(0, 4).map((b) => ({ n: b, l: industryLabel || "Local pros" }))
            : [
                { n: "Free Quote", l: "No obligation" },
                { n: "Licensed", l: "Fully insured" },
                { n: "5★", l: "Top-rated" },
                { n: "Same Day", l: "Fast response" },
              ]
          ).map((s) => (
            <div key={s.n} className="preview-stat-tile">
              <div className="preview-stat-num">{s.n}</div>
              <div className="preview-stat-label">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="preview-wave" style={{ background: "#fff" }}>
        <svg
          viewBox="0 0 1200 40"
          preserveAspectRatio="none"
          style={{ position: "absolute", width: "100%", height: "100%" }}
        >
          <path d="M0 0 Q300 40 600 20 Q900 0 1200 28 L1200 0 Z" fill="#1e293b" />
        </svg>
      </div>

      {form.services.length > 0 ? (
        <div className="preview-features" id="preview-services">
          <div className="preview-features-title">Our Services</div>
          <div className="preview-features-sub">
            Professional {industryLabel ? industryLabel.toLowerCase() : "home service"} work — start to finish.
          </div>
          <div className="preview-features-grid">
            {form.services.slice(0, 6).map((s, i) => (
              <div key={i} className="preview-feat-card">
                <div className="preview-feat-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    style={{ width: 18, height: 18 }}
                  >
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                </div>
                <div className="preview-feat-title">{s.name || "Service"}</div>
                {s.description ? <div className="preview-feat-desc">{s.description}</div> : null}
                <a href="#preview-request-form" className="preview-feat-link">
                  {form.ctaText || "Get a quote"} →
                </a>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {form.aboutText ? (
        <div className="preview-about">
          <h2>About {companyName}</h2>
          <p>{form.aboutText}</p>
        </div>
      ) : null}

      {form.galleryPhotos.length > 0 ? (
        <div className="preview-gallery">
          <div className="preview-features-title">Recent Work</div>
          <div className="preview-gallery-grid">
            {form.galleryPhotos.map((photo, index) => (
              <div key={`gallery-${index}`} className="preview-gallery-card">
                <img
                  src={photo.src}
                  alt={photo.alt || `Project ${index + 1}`}
                  className="preview-gallery-photo"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {testimonials.length > 0 ? (
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
      ) : null}

      <div className="preview-cta-section">
        <h2>{companyProfile?.phone ? "Call us today." : "Get your free quote."}</h2>
        {companyProfile?.phone ? (
          <span style={{ fontSize: "1.4rem", fontWeight: 900, display: "block", marginBottom: 16 }}>
            {companyProfile.phone}
          </span>
        ) : null}
        <a href="#preview-request-form" className="preview-cta-btn">
          {form.ctaText || "Get a quote"}
        </a>
      </div>

      <div id="preview-request-form" className="preview-request-shell">
        <div className="preview-request-card">
          <h3 style={{ color: "#fff", marginBottom: 12 }}>Request Service</h3>
          <div className="preview-request-grid">
            <input type="text" placeholder="Full name" readOnly />
            <input type="tel" placeholder="Phone" readOnly />
            <select className="preview-request-full" defaultValue="" disabled>
              <option value="">Type of work</option>
              {requestServices.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 14 }}>
            {canOpenRequestPage ? (
              <a href={requestUrl} className="preview-cta-btn">
                Send Request
              </a>
            ) : (
              <button
                type="button"
                className="preview-cta-btn"
                style={{ border: "none", cursor: "pointer" }}
                onClick={onRequestBlocked}
              >
                Send Request (Save First)
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="preview-footer">
        &copy; {new Date().getFullYear()} {companyName}. Powered by FieldBase
      </div>
    </div>
  );
}
