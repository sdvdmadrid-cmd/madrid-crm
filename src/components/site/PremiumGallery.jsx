"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import BeforeAfterCompare from "@/components/site/BeforeAfterCompare";

function GalleryTile({ photo, index, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  const src = photo.thumbnail || photo.src;

  return (
    <button
      type="button"
      className="ps-gallery-item ps-reveal"
      style={{ animationDelay: `${Math.min(index * 0.05, 0.35)}s` }}
      onClick={() => onOpen(index)}
      aria-label={`View ${photo.alt || "project photo"} fullscreen`}
    >
      <div className="ps-gallery-media">
        {!loaded ? <div className="ps-gallery-skeleton" aria-hidden /> : null}
        <img
          src={src}
          alt={photo.alt || `Project ${index + 1}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={loaded ? "ps-loaded" : ""}
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }}
        />
        <span className="ps-gallery-expand-hint" aria-hidden>
          ⤢
        </span>
        {photo.kind === "before" || photo.kind === "after" ? (
          <span className="ps-gallery-badge">{photo.kind}</span>
        ) : null}
        <div className="ps-gallery-overlay">
          <span className="ps-gallery-caption">{photo.alt || "View project"}</span>
        </div>
      </div>
    </button>
  );
}

function Lightbox({ photos, index, onClose, onNav }) {
  const photo = photos[index];
  const touchStartX = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNav(-1);
      if (e.key === "ArrowRight") onNav(1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onNav]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e) => {
    const start = touchStartX.current;
    const end = e.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (start == null || end == null) return;
    const delta = end - start;
    if (Math.abs(delta) > 48) {
      onNav(delta > 0 ? -1 : 1);
    }
  };

  if (!photo) return null;

  return (
    <div
      className="ps-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery viewer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="ps-lightbox-toolbar">
        <span>
          {index + 1} / {photos.length}
        </span>
        <button type="button" className="ps-lightbox-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="ps-lightbox-stage">
        {photos.length > 1 ? (
          <button type="button" className="ps-lightbox-nav ps-lightbox-prev" onClick={() => onNav(-1)} aria-label="Previous">
            ‹
          </button>
        ) : null}
        <img src={photo.src} alt={photo.alt || ""} className="ps-lightbox-img" draggable={false} />
        {photos.length > 1 ? (
          <button type="button" className="ps-lightbox-nav ps-lightbox-next" onClick={() => onNav(1)} aria-label="Next">
            ›
          </button>
        ) : null}
      </div>
      <div className="ps-lightbox-footer">{photo.alt || ""}</div>
    </div>
  );
}

function pairBeforeAfter(portfolio) {
  const pairs = [];
  if (!portfolio?.projects?.length) return pairs;

  for (const project of portfolio.projects) {
    const photos = project.photos || [];
    const before = photos.find((p) => p.kind === "before" && p.src);
    const after = photos.find((p) => p.kind === "after" && p.src);
    if (before && after) {
      pairs.push({
        id: `${project.id}-ba`,
        beforeSrc: before.src,
        afterSrc: after.src,
        title: project.name,
      });
    }
  }
  return pairs.slice(0, 3);
}

export default function PremiumGallery({
  photos = [],
  portfolio = null,
  title,
  subtitle,
  useNextImage = true,
}) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const list = useMemo(
    () =>
      (Array.isArray(photos) ? photos : []).filter((p) => {
        const src = String(p?.src || "").trim();
        return src.startsWith("http") || src.startsWith("data:image/");
      }),
    [photos],
  );

  const beforeAfterPairs = useMemo(() => pairBeforeAfter(portfolio), [portfolio]);

  const openLightbox = useCallback((index) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const navLightbox = useCallback(
    (dir) => {
      setLightboxIndex((current) => {
        if (current == null) return current;
        const next = (current + dir + list.length) % list.length;
        return next;
      });
    },
    [list.length],
  );

  if (!list.length && !beforeAfterPairs.length) return null;

  return (
    <section className="ps-gallery-section ps-reveal" id="gallery">
      <div className="s-gallery-inner">
        {title ? <h2 className="s-section-eyebrow">{title}</h2> : null}
        {subtitle ? <p className="s-section-sub">{subtitle}</p> : null}

        {beforeAfterPairs.length > 0 ? (
          <div className="ps-before-after-section">
            <h3
              style={{
                textAlign: "center",
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#1e293b",
                marginBottom: 20,
              }}
            >
              Before & After
            </h3>
            {beforeAfterPairs.map((pair) => (
              <div key={pair.id} style={{ marginBottom: 32 }}>
                {pair.title ? (
                  <p
                    style={{
                      textAlign: "center",
                      fontWeight: 700,
                      color: "#64748b",
                      marginBottom: 12,
                      fontSize: 14,
                    }}
                  >
                    {pair.title}
                  </p>
                ) : null}
                <BeforeAfterCompare beforeSrc={pair.beforeSrc} afterSrc={pair.afterSrc} />
              </div>
            ))}
          </div>
        ) : null}

        {list.length > 0 ? (
          <div className="ps-gallery-masonry">
            {list.map((photo, index) =>
              useNextImage && photo.src.startsWith("http") ? (
                <button
                  key={photo.id || index}
                  type="button"
                  className="ps-gallery-item ps-reveal"
                  onClick={() => openLightbox(index)}
                  aria-label={`View ${photo.alt || "photo"}`}
                >
                  <div className="ps-gallery-media">
                    <Image
                      src={photo.thumbnail || photo.src}
                      alt={photo.alt || ""}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      style={{ objectFit: "cover" }}
                      unoptimized
                    />
                    <span className="ps-gallery-expand-hint">⤢</span>
                    <div className="ps-gallery-overlay">
                      <span className="ps-gallery-caption">{photo.alt || "View project"}</span>
                    </div>
                  </div>
                </button>
              ) : (
                <GalleryTile key={photo.id || index} photo={photo} index={index} onOpen={openLightbox} />
              ),
            )}
          </div>
        ) : null}
      </div>

      {lightboxIndex != null ? (
        <Lightbox photos={list} index={lightboxIndex} onClose={closeLightbox} onNav={navLightbox} />
      ) : null}
    </section>
  );
}
