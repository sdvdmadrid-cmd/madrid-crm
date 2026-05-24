"use client";

import { useEffect } from "react";
import "@/styles/public-site-premium.css";

export default function PublicSiteEnhancements({ stickyCtaHref, stickyCtaLabel }) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    document.body.classList.add("ps-has-sticky-cta");

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = document.querySelectorAll(".ps-reveal");

    if (prefersReduced) {
      nodes.forEach((el) => el.classList.add("ps-visible"));
      return () => {
        document.body.classList.remove("ps-has-sticky-cta");
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("ps-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    nodes.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      document.body.classList.remove("ps-has-sticky-cta");
    };
  }, []);

  if (!stickyCtaHref || !stickyCtaLabel) return null;

  return (
    <div className="ps-sticky-cta" aria-hidden={false}>
      <a href={stickyCtaHref}>{stickyCtaLabel}</a>
    </div>
  );
}
