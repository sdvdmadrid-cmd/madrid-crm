"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "@/app/invoices/invoices.module.css";

function IconDots() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

async function copyShareUrl(resolveShareData, copiedLabel) {
  const data = await resolveShareData();
  const url = String(data?.url || "").trim();
  if (!url) throw new Error("No share URL");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
  }
  if (copiedLabel) window.alert(copiedLabel);
  return url;
}

export default function InvoiceListCard({
  invoice,
  canEdit,
  canDelete,
  canManagePayments,
  canSendExternal,
  stripeConfigured,
  statusLabel,
  amountLabel,
  dueLabel,
  onView,
  onEdit,
  onDuplicate,
  onDownloadPdf,
  onPrint,
  onSendEmail,
  onSendText,
  onShare,
  onChargeOnline,
  onRegisterPayment,
  onDelete,
}) {
  const { t } = useTranslation();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const status = String(invoice.status || "Draft");
  const statusClass =
    styles[`statusBadge_${status.toLowerCase()}`] || styles.statusBadge_draft;

  const runMenuAction = (action) => {
    setMenuOpen(false);
    action?.();
  };

  const menuItems = [
    {
      key: "view",
      label: t("invoices.menu.view", { defaultValue: "View" }),
      onClick: () => runMenuAction(onView),
      show: true,
    },
    {
      key: "edit",
      label: t("invoices.buttons.edit"),
      onClick: () => runMenuAction(onEdit),
      show: canEdit,
    },
    {
      key: "duplicate",
      label: t("invoices.menu.duplicate", { defaultValue: "Duplicate" }),
      onClick: () => runMenuAction(onDuplicate),
      show: canEdit,
    },
    {
      key: "pdf",
      label: t("invoices.buttons.downloadPdf", { defaultValue: "Download PDF" }),
      onClick: () => runMenuAction(onDownloadPdf),
      show: true,
    },
    {
      key: "print",
      label: t("invoices.buttons.printInvoice"),
      onClick: () => runMenuAction(onPrint),
      show: true,
    },
    {
      key: "email",
      label: t("invoices.buttons.sendInvoiceEmail"),
      onClick: () => runMenuAction(onSendEmail),
      show: canSendExternal,
    },
    {
      key: "text",
      label: t("invoices.buttons.sendInvoiceText"),
      onClick: () => runMenuAction(onSendText),
      show: canSendExternal,
    },
    {
      key: "share",
      label: t("invoices.buttons.shareInvoice"),
      onClick: () =>
        runMenuAction(() => {
          void copyShareUrl(onShare, t("invoices.messages.invoiceLinkCopied")).catch(
            () => {
              window.alert(t("invoices.errors.shareInvoiceFallback"));
            },
          );
        }),
      show: canSendExternal,
    },
    {
      key: "charge",
      label: t("invoices.buttons.chargeOnline"),
      onClick: () => runMenuAction(onChargeOnline),
      show: canManagePayments && stripeConfigured,
    },
    {
      key: "payment",
      label: t("invoices.buttons.registerPayment"),
      onClick: () => runMenuAction(onRegisterPayment),
      show: canManagePayments,
    },
    {
      key: "delete",
      label: t("invoices.buttons.delete"),
      onClick: () => runMenuAction(onDelete),
      show: canDelete,
      danger: true,
    },
  ].filter((item) => item.show);

  return (
    <article
      ref={rootRef}
      className={styles.listCard}
      data-testid="invoice-card"
    >
      <div className={styles.listCardMain}>
        <div className={styles.listCardTop}>
          <h3 className={styles.listCardNumber}>
            {invoice.invoiceNumber || t("invoices.labels.untitled")}
          </h3>
          <span className={`${styles.statusBadge} ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <p className={styles.listCardClient}>{invoice.clientName}</p>
        <div className={styles.listCardMeta}>
          <span className={styles.listCardAmount}>{amountLabel}</span>
          <span className={styles.listCardDue}>{dueLabel}</span>
        </div>
        <p className={styles.listCardAmountDetail}>
          {t("invoices.labels.amount")}: ${Number(invoice.amount || 0).toFixed(2)}
        </p>
        {Number(invoice.paidAmount || 0) > 0 ? (
          <p className={styles.listCardPaidDetail}>
            {t("invoices.labels.paid")}: $
            {Number(invoice.paidAmount || 0).toFixed(2)} |{" "}
            {t("invoices.labels.balance")}: $
            {Number(invoice.balanceDue || invoice.amount || 0).toFixed(2)}
          </p>
        ) : null}
      </div>

      <div className={styles.listCardMenuWrap}>
        <button
          type="button"
          className={styles.listCardMenuBtn}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={t("invoices.menu.open", { defaultValue: "Invoice actions" })}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <IconDots />
        </button>

        {menuOpen ? (
          <div id={menuId} role="menu" className={styles.listCardMenu}>
            {menuItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={
                  item.danger
                    ? `${styles.listCardMenuItem} ${styles.listCardMenuItemDanger}`
                    : styles.listCardMenuItem
                }
                onClick={item.onClick}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <a
        href={`/api/invoices/${invoice._id}/pdf`}
        className={styles.srOnlyLink}
        data-testid="invoice-card-pdf-link"
      >
        {t("invoices.buttons.downloadPdf", { defaultValue: "Download PDF" })}
      </a>
      <button
        type="button"
        className={styles.srOnlyLink}
        data-testid="invoice-card-print-link"
        onClick={onPrint}
      >
        {t("invoices.buttons.printInvoice", {
          defaultValue: "Print invoice document",
        })}
      </button>
    </article>
  );
}
