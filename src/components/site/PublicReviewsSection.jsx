"use client";

import { useEffect, useMemo, useState } from "react";
import "@/styles/public-site-premium.css";

const PLATFORM_ICONS = {
  google: "G",
  yelp: "Y",
  facebook: "f",
  instagram: "◎",
  tiktok: "♪",
  houzz: "H",
  angi: "A",
  thumbtack: "T",
  manual: "★",
  other: "•",
};

function Stars({ rating }) {
  const value = Number(rating) || 0;
  return (
    <span className="ps-review-stars" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < Math.round(value) ? "ps-star-on" : "ps-star-off"}>
          ★
        </span>
      ))}
    </span>
  );
}

function ReviewCard({ review }) {
  return (
    <article className="ps-review-card">
      <div className="ps-review-card-head">
        <div className="ps-review-avatar">
          {review.photoUrl ? (
            <img src={review.photoUrl} alt="" />
          ) : (
            (review.authorName || "C").charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <div className="ps-review-author">{review.authorName}</div>
          <div className="ps-review-meta">
            <Stars rating={review.rating} />
            {review.verified ? (
              <span className="ps-review-verified">Verified customer</span>
            ) : null}
          </div>
        </div>
        <span className="ps-review-platform" title={review.platform}>
          {PLATFORM_ICONS[review.platform] || "★"}
        </span>
      </div>
      <p className="ps-review-quote">&ldquo;{review.reviewText}&rdquo;</p>
      {review.videoUrl ? (
        <a className="ps-review-video" href={review.videoUrl} target="_blank" rel="noreferrer">
          Watch video testimonial →
        </a>
      ) : null}
      {review.serviceType ? (
        <span className="ps-review-service-tag">{review.serviceType}</span>
      ) : null}
    </article>
  );
}

export default function PublicReviewsSection({ reviews = [], stats = null, title, subtitle }) {
  const list = useMemo(() => (Array.isArray(reviews) ? reviews : []), [reviews]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (list.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [list.length]);

  if (!list.length) return null;

  const visible = list.length <= 3 ? list : [list[index], list[(index + 1) % list.length]];

  return (
    <section className="ps-reviews-section ps-reveal ps-visible" id="reviews">
      <div className="s-gallery-inner">
        {title ? <h2 className="s-section-eyebrow">{title}</h2> : null}
        {subtitle ? <p className="s-section-sub">{subtitle}</p> : null}

        {stats?.count ? (
          <div className="ps-review-stats">
            <div className="ps-review-stat">
              <strong>{stats.averageRating ?? "5.0"}</strong>
              <span>Average rating</span>
            </div>
            <div className="ps-review-stat">
              <strong>{stats.count}</strong>
              <span>Customer reviews</span>
            </div>
            {stats.verifiedCount > 0 ? (
              <div className="ps-review-stat">
                <strong>{stats.verifiedCount}</strong>
                <span>Verified</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="ps-review-carousel">
          {visible.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>

        {list.length > 2 ? (
          <div className="ps-review-dots" aria-hidden>
            {list.map((r, i) => (
              <button
                key={r.id}
                type="button"
                className={i === index ? "ps-active" : ""}
                onClick={() => setIndex(i)}
                aria-label={`Show review ${i + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
