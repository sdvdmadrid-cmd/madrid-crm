"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import actions from "./client-card-actions.module.css";

function IconMore() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export default function ClientCardActions({
  client,
  canDelete,
  onView,
  onEdit,
  onDelete,
  onEstimate,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 220;
    const left = Math.min(
      Math.max(12, rect.right - menuWidth),
      window.innerWidth - menuWidth - 12,
    );

    setMenuPosition({
      top: rect.bottom + 6,
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
    if (!open) return undefined;

    function close(event) {
      const target = event.target;
      if (
        wrapRef.current?.contains(target) ||
        (target instanceof Element && target.closest("[data-client-card-menu]"))
      ) {
        return;
      }
      setOpen(false);
    }

    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runAction = (handler) => {
    setOpen(false);
    handler?.(client);
  };

  const floatingMenu =
    open && menuPosition && typeof document !== "undefined"
      ? createPortal(
          <ul
            className={actions.menuFloating}
            role="menu"
            data-client-card-menu
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              zIndex: 10050,
            }}
          >
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={actions.item}
                onClick={() => runAction(onView)}
              >
                {t("clients.cardMenu.view")}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={actions.item}
                onClick={() => runAction(onEdit)}
              >
                {t("clients.cardMenu.edit")}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={actions.item}
                onClick={() => runAction(onEstimate)}
              >
                {t("clients.cardMenu.estimate")}
              </button>
            </li>
            {canDelete ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`${actions.item} ${actions.itemDanger}`}
                  onClick={() => {
                    setOpen(false);
                    onDelete?.(client.id);
                  }}
                >
                  {t("clients.cardMenu.delete")}
                </button>
              </li>
            ) : null}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div
      ref={wrapRef}
      className={actions.wrap}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={actions.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("clients.cardMenu.label")}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMore />
      </button>
      {floatingMenu}
    </div>
  );
}
