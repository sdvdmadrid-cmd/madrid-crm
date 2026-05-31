"use client";

import page from "./clients-page.module.css";

export default function ClientFormModal({ open, title, onClose, children }) {
  if (!open) return null;

  return (
    <div
      className={page.modalOverlay}
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
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
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
}
