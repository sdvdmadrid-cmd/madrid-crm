"use client";

import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  computeInvoiceLineItemTotal,
  createInvoiceLineItem,
} from "@/lib/invoice-line-items";
import styles from "@/app/invoices/invoices.module.css";

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

const COL_COUNT = 3;

export default function InvoiceLineItemsEditor({
  lineItems = [],
  onChange,
  disabled = false,
}) {
  const { t } = useTranslation();
  const gridRef = useRef(null);
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

  const addRow = useCallback(() => {
    onChange?.([...rows, createInvoiceLineItem()]);
  }, [onChange, rows]);

  const focusCell = (rowIndex, colIndex) => {
    const el = gridRef.current?.querySelector(
      `[data-cell="${rowIndex}-${colIndex}"]`,
    );
    el?.focus();
    el?.select?.();
  };

  const handleKeyDown = (event, rowIndex, colIndex) => {
    if (disabled) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (colIndex < COL_COUNT - 1) {
        focusCell(rowIndex, colIndex + 1);
        return;
      }
      if (rowIndex < rows.length - 1) {
        focusCell(rowIndex + 1, 0);
        return;
      }
      addRow();
      requestAnimationFrame(() => focusCell(rowIndex + 1, 0));
      return;
    }

    if (event.key === "Tab" && !event.shiftKey && colIndex === COL_COUNT - 1) {
      if (rowIndex === rows.length - 1) {
        event.preventDefault();
        addRow();
        requestAnimationFrame(() => focusCell(rowIndex + 1, 0));
      }
    }
  };

  return (
    <div
      ref={gridRef}
      className={styles.lineItemsSpreadsheet}
      data-testid="invoice-line-items-section"
    >
      <div className={styles.lineItemsSpreadsheetHead} aria-hidden="true">
        <span>
          {t("invoices.lineItems.description", { defaultValue: "Description" })}
        </span>
        <span>{t("invoices.lineItems.quantity", { defaultValue: "Qty" })}</span>
        <span>
          {t("invoices.lineItems.unitPrice", { defaultValue: "Unit price" })}
        </span>
        <span>
          {t("invoices.lineItems.lineTotal", { defaultValue: "Amount" })}
        </span>
        <span />
      </div>

      {rows.map((row, index) => {
        const lineTotal = computeInvoiceLineItemTotal(row);
        return (
          <div
            key={row.id || `row-${index}`}
            className={styles.lineItemsSpreadsheetRow}
            data-testid="invoice-line-item-row"
          >
            <input
              type="text"
              className={styles.lineItemsCell}
              value={row.description || row.label || ""}
              disabled={disabled}
              placeholder={t("invoices.lineItems.descriptionPlaceholder", {
                defaultValue: "Service description",
              })}
              data-cell={`${index}-0`}
              data-testid="invoice-line-item-description"
              onKeyDown={(event) => handleKeyDown(event, index, 0)}
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
              className={styles.lineItemsCellQty}
              value={row.quantity ?? row.qty ?? 1}
              disabled={disabled}
              data-cell={`${index}-1`}
              onKeyDown={(event) => handleKeyDown(event, index, 1)}
              onChange={(event) => {
                const quantity = event.target.value;
                updateRow(index, { quantity, qty: quantity });
              }}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className={styles.lineItemsCellMoney}
              value={row.unitPrice ?? ""}
              disabled={disabled}
              data-cell={`${index}-2`}
              onKeyDown={(event) => handleKeyDown(event, index, 2)}
              onChange={(event) =>
                updateRow(index, { unitPrice: event.target.value })
              }
            />
            <div className={styles.lineItemsAmountCell}>
              ${formatMoney(lineTotal)}
            </div>
            <button
              type="button"
              className={styles.lineItemsRemoveBtn}
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

      <button
        type="button"
        className={styles.lineItemsAddRow}
        disabled={disabled}
        data-testid="invoice-add-line-item"
        onClick={addRow}
      >
        {t("invoices.lineItems.addItem", { defaultValue: "+ Add item" })}
      </button>
    </div>
  );
}
