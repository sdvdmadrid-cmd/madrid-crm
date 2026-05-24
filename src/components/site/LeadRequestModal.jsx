"use client";

import { useEffect, useRef } from "react";
import PremiumLeadForm from "@/components/site/PremiumLeadForm";

export default function LeadRequestModal({
  open,
  onClose,
  slug,
  serviceOptions = [],
  initialService = "",
  locale = "en",
  themeColor = "#1d4ed8",
  companyName = "",
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);

    const t = window.setTimeout(() => {
      panelRef.current?.querySelector("input, select, textarea, button")?.focus?.();
    }, 80);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ps-lead-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="ps-lead-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ps-lead-modal-title"
        ref={panelRef}
        style={{ "--theme": themeColor }}
      >
        <div className="ps-lead-modal-head">
          <div>
            <p className="ps-lead-modal-eyebrow">Free estimate</p>
            <h2 id="ps-lead-modal-title" className="ps-lead-modal-title">
              {companyName ? `Request a quote from ${companyName}` : "Request a quote"}
            </h2>
            <p className="ps-lead-modal-sub">
              Tell us about your project — we respond fast. Your info stays private.
            </p>
          </div>
          <button
            type="button"
            className="ps-lead-modal-close"
            onClick={() => onClose?.()}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <PremiumLeadForm
          slug={slug}
          serviceOptions={serviceOptions}
          initialService={initialService}
          locale={locale}
          themeColor={themeColor}
        />
      </div>
    </div>
  );
}
