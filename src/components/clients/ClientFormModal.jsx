"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import page from "./clients-page.module.css";

export default function ClientFormModal({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const dialog = (
    <div
      className={`${page.modalOverlay} fb-workspace`}
      onClick={onClose}
      data-testid="client-form-modal-overlay"
    >
      <div
        className={page.modalPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-form-modal-title"
        data-testid="client-form-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={page.modalHeader}>
          <h2 id="client-form-modal-title" className={page.modalTitle}>
            {title}
          </h2>
          <button
            type="button"
            className={page.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className={page.modalBody}>{children}</div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
