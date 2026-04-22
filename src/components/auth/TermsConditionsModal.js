"use client";

import { useEffect } from "react";

export default function TermsConditionsModal({ open, onClose, content }) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !content) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
      }}
    >
      <button
        type="button"
        aria-label={content.close}
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          background: "rgba(15, 23, 42, 0.56)",
          padding: 0,
          cursor: "pointer",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 760,
          maxHeight: "min(82vh, 860px)",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: 18,
          border: "1px solid #e5e7eb",
          boxShadow: "0 18px 60px rgba(15, 23, 42, 0.18)",
          padding: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {content.updatedAt}
            </p>
            <h2
              style={{
                margin: "8px 0 0",
                fontSize: 28,
                lineHeight: 1.1,
                color: "#111827",
              }}
            >
              {content.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#374151",
              borderRadius: 999,
              padding: "8px 14px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {content.close}
          </button>
        </div>

        <p style={{ margin: "0 0 22px", color: "#4b5563", fontSize: 15 }}>
          {content.intro}
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          {content.sections.map((section) => (
            <section
              key={section.title}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 18,
                background: "#fcfcfd",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, color: "#111827" }}>
                {section.title}
              </h3>
              <p style={{ margin: "8px 0 0", color: "#4b5563", fontSize: 14 }}>
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
