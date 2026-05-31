"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import BeforeAfterCompare from "@/components/site/BeforeAfterCompare";

import {
  normalizeGalleryPhotos,
  resolvePublicGalleryPhotos,
} from "@/lib/website-gallery";



const LOAD_TIMEOUT_MS = 14_000;



function isValidGallerySrc(src) {

  const value = String(src || "").trim();

  return value.startsWith("http") || value.startsWith("data:image/");

}



function GalleryTile({ photo, index, onOpen, hideFailedPlaceholder = false, onLoadFailed }) {
  const [status, setStatus] = useState("loading");
  const src = String(photo.thumbnail || photo.src || "").trim();
  const photoKey = photo.id || `g-${index}`;

  useEffect(() => {
    if (!isValidGallerySrc(src)) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    const timer = window.setTimeout(() => setStatus("error"), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [src]);

  useEffect(() => {
    if (status === "error") {
      onLoadFailed?.(photoKey);
    }
  }, [status, onLoadFailed, photoKey]);

  if (!isValidGallerySrc(src)) {
    return null;
  }

  if (status === "error") {
    if (hideFailedPlaceholder) return null;
    return (
      <div
        className="ps-gallery-item ps-gallery-item-placeholder ps-reveal"
        role="presentation"
        style={{ animationDelay: `${Math.min(index * 0.05, 0.35)}s` }}
      >
        <div className="ps-gallery-placeholder-inner">
          <span className="ps-gallery-placeholder-icon" aria-hidden>
            🏡
          </span>
          <p>Photo unavailable</p>
        </div>
      </div>
    );
  }



  return (

    <button

      type="button"

      className="ps-gallery-item ps-reveal"

      style={{ animationDelay: `${Math.min(index * 0.05, 0.35)}s` }}

      onClick={() => (status === "loaded" ? onOpen(index) : undefined)}

      disabled={status !== "loaded"}

      aria-label={`View ${photo.alt || "project photo"} fullscreen`}

    >

      <div className="ps-gallery-media">

        {status === "loading" ? <div className="ps-gallery-skeleton" aria-hidden /> : null}

        <img

          src={src}

          alt={photo.alt || `Project ${index + 1}`}

          loading="lazy"

          decoding="async"

          onLoad={() => setStatus("loaded")}

          onError={() => {
            setStatus("error");
          }}

          className={status === "loaded" ? "ps-loaded" : ""}

          style={{

            opacity: status === "loaded" ? 1 : 0,

            transition: "opacity 0.4s ease",

          }}

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

          <button

            type="button"

            className="ps-lightbox-nav ps-lightbox-prev"

            onClick={() => onNav(-1)}

            aria-label="Previous"

          >

            ‹

          </button>

        ) : null}

        <img src={photo.src} alt={photo.alt || ""} className="ps-lightbox-img" draggable={false} />

        {photos.length > 1 ? (

          <button

            type="button"

            className="ps-lightbox-nav ps-lightbox-next"

            onClick={() => onNav(1)}

            aria-label="Next"

          >

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

    const before = photos.find((p) => p.kind === "before" && isValidGallerySrc(p.src));

    const after = photos.find((p) => p.kind === "after" && isValidGallerySrc(p.src));

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

  emptyTitle = "Project gallery",

  emptyBody = "Upload portfolio photos in Website Builder to showcase your best work here.",
  builderEditable = false,
  onUploadClick = null,
  uploadLabel = "Upload project photos",
}) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [failedKeys, setFailedKeys] = useState(() => new Set());

  const list = useMemo(() => {
    if (builderEditable) {
      return normalizeGalleryPhotos(photos).filter((p) => isValidGallerySrc(p?.src || p?.thumbnail));
    }
    return resolvePublicGalleryPhotos(photos, portfolio);
  }, [photos, portfolio, builderEditable]);

  const markFailed = useCallback((key) => {
    setFailedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    setFailedKeys(new Set());
  }, [photos]);

  const displayList = useMemo(() => {
    if (!builderEditable) return list;
    return list.filter((p, i) => !failedKeys.has(p.id || `g-${i}`));
  }, [list, failedKeys, builderEditable]);

  const allPhotosFailed =
    builderEditable && list.length > 0 && displayList.length === 0;



  const beforeAfterPairs = useMemo(() => pairBeforeAfter(portfolio), [portfolio]);



  const openLightbox = useCallback((index) => setLightboxIndex(index), []);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const navLightbox = useCallback(

    (dir) => {

      setLightboxIndex((current) => {

        if (current == null) return current;

        const next = (current + dir + displayList.length) % displayList.length;

        return next;

      });

    },

    [displayList.length],

  );



  const hasContent = list.length > 0 || beforeAfterPairs.length > 0;



  if (!hasContent) {

    return (

      <section className="ps-gallery-section ps-reveal" id="gallery">

        <div className="ps-gallery-empty">

          <span className="ps-gallery-empty-icon" aria-hidden>

            📷

          </span>

          <p className="ps-gallery-empty-title">{emptyTitle}</p>

          <p className="ps-gallery-empty-body">{emptyBody}</p>

        </div>

      </section>

    );

  }



  return (

    <section className="ps-gallery-section ps-reveal" id="gallery">

      <div className="ps-gallery-inner">

        {title ? <h2 className="ps-section-eyebrow">{title}</h2> : null}

        {subtitle ? <p className="ps-section-sub">{subtitle}</p> : null}



        {beforeAfterPairs.length > 0 ? (

          <div className="ps-before-after-section">

            <h3 className="ps-before-after-heading">Before & After</h3>

            {beforeAfterPairs.map((pair) => (

              <div key={pair.id} className="ps-before-after-block">

                {pair.title ? <p className="ps-before-after-label">{pair.title}</p> : null}

                <BeforeAfterCompare beforeSrc={pair.beforeSrc} afterSrc={pair.afterSrc} />

              </div>

            ))}

          </div>

        ) : null}



        {displayList.length > 0 ? (
          <div className="ps-gallery-masonry">
            {displayList.map((photo, index) => (
              <GalleryTile
                key={photo.id || `g-${index}`}
                photo={photo}
                index={index}
                onOpen={openLightbox}
                hideFailedPlaceholder={builderEditable}
                onLoadFailed={markFailed}
              />
            ))}
          </div>
        ) : null}

        {builderEditable && onUploadClick && displayList.length > 0 ? (
          <div className="ps-gallery-builder-upload-bar">
            <button type="button" className="ps-gallery-upload-btn" onClick={onUploadClick}>
              + {uploadLabel}
            </button>
          </div>
        ) : null}

      </div>



      {lightboxIndex != null ? (

        <Lightbox
          photos={displayList}
          index={lightboxIndex}
          onClose={closeLightbox}
          onNav={navLightbox}
        />

      ) : null}

    </section>

  );

}

