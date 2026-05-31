"use client";

import { useState } from "react";
import { filterHomeownerFacingServices } from "@/lib/website-lead-form";

const SERVICE_VISUALS = [
  { match: /lawn|mow|turf|aeration|overseed/i, emoji: "🌿", accent: "#15803d" },
  { match: /mulch|bed/i, emoji: "🪵", accent: "#92400e" },
  { match: /rock|gravel/i, emoji: "🪨", accent: "#57534e" },
  { match: /sod|new lawn/i, emoji: "🌱", accent: "#16a34a" },
  { match: /drain|french|swale|downspout/i, emoji: "💧", accent: "#0369a1" },
  { match: /hardscape|patio|paver|walkway|fire pit/i, emoji: "🧱", accent: "#57534e" },
  { match: /retain|wall/i, emoji: "⛰️", accent: "#78716c" },
  { match: /spring|fall|cleanup|leaf|snow/i, emoji: "🍂", accent: "#d97706" },
  { match: /design|renovation/i, emoji: "📐", accent: "#1d4ed8" },
  { match: /landscap|plant|shrub|bush|tree/i, emoji: "🌳", accent: "#15803d" },
  { match: /irrigation/i, emoji: "💦", accent: "#0284c7" },
  { match: /grade|grading/i, emoji: "🚜", accent: "#a16207" },
  { match: /light/i, emoji: "💡", accent: "#ca8a04" },
  { match: /commercial|hoa/i, emoji: "🏢", accent: "#334155" },
];

function resolveServiceVisual(name, themeColor) {
  const label = String(name || "");
  for (const item of SERVICE_VISUALS) {
    if (item.match.test(label)) {
      return { emoji: item.emoji, accent: item.accent };
    }
  }
  return { emoji: "✦", accent: themeColor || "#15803d" };
}

function pickCardPhoto(photos, index) {
  const list = (Array.isArray(photos) ? photos : []).filter((p) => {
    const src = String(p?.thumbnail || p?.src || "").trim();
    return src.startsWith("http") || src.startsWith("data:image/");
  });
  if (!list.length) return null;
  return list[index % list.length];
}

function ServiceCardMedia({ photoSrc, visual, name }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photoSrc) && !failed;

  if (!showPhoto) {
    return (
      <div className="ps-service-card-icon" aria-hidden>
        <span className="ps-service-card-icon-emoji">{visual.emoji}</span>
        <span className="ps-service-card-icon-label">{name}</span>
      </div>
    );
  }

  return (
    <div className="ps-service-card-media" aria-hidden>
      <img
        src={photoSrc}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <div className="ps-service-card-media-shade" />
    </div>
  );
}

export default function PublicServicesSection({
  services = [],
  themeColor = "#15803d",
  quoteHref = "#request-service",
  title = "Our Services",
  subtitle = "Professional outdoor services tailored to your property.",
  quoteLabel = "Free Estimate",
  galleryPhotos = [],
  editable = false,
  onServiceChange,
  renderTitle,
  renderDescription,
}) {
  const displayServices = filterHomeownerFacingServices(services).slice(0, 12);

  return (
    <section className="ps-services-section ps-reveal" id="services">
      <div className="ps-services-inner">
        <p className="ps-services-eyebrow">What we do</p>
        <h2 className="ps-services-title">{title}</h2>
        <p className="ps-services-sub">{subtitle}</p>
        {displayServices.length === 0 ? (
          <p className="ps-services-empty">
            Service details are being updated. Call or request a quote to discuss your project.
          </p>
        ) : (
          <div className="ps-services-grid">
            {displayServices.map((service, index) => {
              const visual = resolveServiceVisual(service.name, themeColor);
              const photo = pickCardPhoto(galleryPhotos, index);
              const photoSrc = photo ? String(photo.thumbnail || photo.src) : "";

              return (
                <article
                  key={`${service.name}-${index}`}
                  className="ps-service-card"
                  style={{ "--service-accent": visual.accent }}
                >
                  <ServiceCardMedia photoSrc={photoSrc} visual={visual} name={service.name} />
                  <div className="ps-service-card-body">
                    <span className="ps-service-estimate-badge">Free Estimate</span>
                    <h3 className="ps-service-name">
                      {editable && renderTitle ? (
                        renderTitle(service, index)
                      ) : (
                        service.name
                      )}
                    </h3>
                    {service.description || editable ? (
                      <p className="ps-service-desc">
                        {editable && renderDescription ? (
                          renderDescription(service, index)
                        ) : (
                          service.description
                        )}
                      </p>
                    ) : null}
                    <a href={quoteHref} className="ps-service-cta">
                      {quoteLabel}
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
