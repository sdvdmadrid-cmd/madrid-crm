"use client";

import { useTranslation } from "react-i18next";
import {
  computeInvoiceLineItemTotal,
  createInvoiceLineItem,
} from "@/lib/invoice-line-items";
import styles from "@/app/invoices/invoices.module.css";

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

export default function InvoiceLineItemsEditor({
  lineItems = [],
  onChange,
  disabled = false,
}) {
  const { t } = useTranslation();
  const rows =
    Array.isArray(lineItems) && lineItems.length > 0
      ? lineItems
      : [createInvoiceLineItem()];

  const updateRow = (index, patch) => {
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    );
    onChange?.(next);
  };

  const removeRow = (index) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange?.(next.length > 0 ? next : [createInvoiceLineItem()]);
  };

  const addRow = () => {
    onChange?.([...rows, createInvoiceLineItem()]);
  };

  return (
    <div
      className={styles.lineItemsSection}
      data-testid="invoice-line-items-section"
    >
      <div className={styles.lineItemRowHeader}>
        <span>{t("invoices.lineItems.description", { defaultValue: "Description" })}</span>
        <span>{t("invoices.lineItems.quantity", { defaultValue: "Qty" })}</span>
        <span>{t("invoices.lineItems.unitPrice", { defaultValue: "Unit price" })}</span>
        <span>{t("invoices.lineItems.lineTotal", { defaultValue: "Total" })}</span>
        <span aria-hidden="true" />
      </div>

      {rows.map((row, index) => {
        const lineTotal = computeInvoiceLineItemTotal(row);
        return (
          <div
            key={row.id || `row-${index}`}
            className={styles.lineItemRow}
            data-testid="invoice-line-item-row"
          >
            <input
              type="text"
              className={styles.lineItemField}
              value={row.description || row.label || ""}
              disabled={disabled}
              placeholder={t("invoices.lineItems.descriptionPlaceholder", {
                defaultValue: "Service description",
              })}
              data-testid="invoice-line-item-description"
              onChange={(event) =>
                updateRow(index, {
                  description: event.target.value,
                  label: event.target.value,
                })
              }
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className={styles.lineItemFieldQty}
              value={row.quantity ?? row.qty ?? 1}
              disabled={disabled}
              onChange={(event) => {
                const quantity = event.target.value;
                updateRow(index, { quantity, qty: quantity });
              }}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className={styles.lineItemFieldMoney}
              value={row.unitPrice ?? ""}
              disabled={disabled}
              onChange={(event) =>
                updateRow(index, { unitPrice: event.target.value })
              }
            />
            <div className={styles.lineItemTotalCell}>${formatMoney(lineTotal)}</div>
            <button
              type="button"
              className={styles.lineItemRemoveBtn}
              disabled={disabled || rows.length <= 1}
              aria-label={t("invoices.lineItems.remove", {
                defaultValue: "Remove line",
              })}
              onClick={() => removeRow(index)}
            >
              ×
            </button>
          </div>
        );
      })}

      <div className={styles.lineItemsFooter}>
        <button
          type="button"
          className={styles.lineItemsAddBtn}
          disabled={disabled}
          data-testid="invoice-add-line-item"
          onClick={addRow}
        >
          {t("invoices.lineItems.addAnother", {
            defaultValue: "Add another item",
          })}
        </button>
      </div>
    </div>
  );
}
