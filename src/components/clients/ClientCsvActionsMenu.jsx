"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import menu from "./client-csv-menu.module.css";

function IconMoreHorizontal() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/**
 * Compact ⋯ menu for client CSV import / export.
 */
export default function ClientCsvActionsMenu({ onImport, disabled = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleExport = async () => {
    setExporting(true);
    setOpen(false);
    try {
      const res = await apiFetch("/api/clients/export", { cache: "no-store" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || t("clients.export.errors.failed"));
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename =
        match?.[1] ||
        `fieldbase-clients-${new Date().toISOString().slice(0, 10)}.csv`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err.message || t("clients.export.errors.failed"));
    } finally {
      setExporting(false);
    }
  };

  const busy = exporting || disabled;

  return (
    <div ref={wrapRef} className={menu.wrap}>
      <button
        type="button"
        className={menu.trigger}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("clients.csvMenu.label")}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMoreHorizontal />
      </button>

      {open ? (
        <ul className={menu.menu} role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={menu.item}
              onClick={() => {
                setOpen(false);
                onImport?.();
              }}
            >
              {t("clients.import.menuLabel")}
              <span className={menu.itemSub}>{t("clients.import.menuHint")}</span>
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={menu.item}
              disabled={exporting}
              onClick={handleExport}
            >
              {exporting
                ? t("clients.export.exporting")
                : t("clients.export.menuLabel")}
              <span className={menu.itemSub}>{t("clients.export.menuHint")}</span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
