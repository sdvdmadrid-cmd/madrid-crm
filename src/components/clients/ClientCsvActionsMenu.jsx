"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * ⋯ menu — Import / Export dropdown (ported so it is never clipped).
 */
export default function ClientCsvActionsMenu({
  onImport,
  onRemoveDuplicates,
  canRemoveDuplicates = false,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 260;
    const left = Math.min(
      Math.max(12, rect.right - menuWidth),
      window.innerWidth - menuWidth - 12,
    );

    setMenuPosition({
      top: rect.bottom + 8,
      left,
      width: menuWidth,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    function handlePointerDown(event) {
      const target = event.target;
      if (
        wrapRef.current?.contains(target) ||
        (target instanceof Element && target.closest(`[data-csv-menu-floating]`))
      ) {
        return;
      }
      setOpen(false);
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

  const handleRemoveDuplicates = async () => {
    if (!onRemoveDuplicates) return;
    setOpen(false);
    setDeduping(true);
    try {
      await onRemoveDuplicates();
    } finally {
      setDeduping(false);
    }
  };

  const busy = exporting || deduping || disabled;

  const floatingMenu =
    open && menuPosition && typeof document !== "undefined"
      ? createPortal(
          <ul
            data-csv-menu-floating
            className={menu.menuFloating}
            role="menu"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
            }}
          >
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
                <span className={menu.itemSub}>
                  {t("clients.import.menuHint")}
                </span>
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
                <span className={menu.itemSub}>
                  {t("clients.export.menuHint")}
                </span>
              </button>
            </li>
            {canRemoveDuplicates ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`${menu.item} ${menu.itemDanger}`}
                  disabled={deduping || exporting}
                  onClick={handleRemoveDuplicates}
                >
                  {deduping
                    ? t("clients.dedupe.removing")
                    : t("clients.dedupe.menuLabel")}
                  <span className={menu.itemSub}>
                    {t("clients.dedupe.menuHint")}
                  </span>
                </button>
              </li>
            ) : null}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={menu.wrap}>
      <button
        ref={triggerRef}
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
      {floatingMenu}
    </div>
  );
}
