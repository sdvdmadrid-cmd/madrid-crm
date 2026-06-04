"use client";

import { useTranslation } from "react-i18next";
import {
  computeInvoiceLineItemTotal,
  createInvoiceLineItem,
  sumInvoiceLineItemsTotals,
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
  const rows = Array.isArray(lineItems) && lineItems.length > 0 ? lineItems : [createInvoiceLineItem()];
  const lineItemsTotal = sumInvoiceLineItemsTotals(rows);

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
      <div className={styles.lineItemsHeader}>
        <h3 className={styles.lineItemsTitle}>
          {t("invoices.lineItems.title", { defaultValue: "Line items" })}
        </h3>
        <p className={styles.lineItemsHint}>
          {t("invoices.lineItems.hint", {
            defaultValue:
              "Add services with quantity and unit price. Invoice total updates automatically.",
          })}
        </p>
      </div>

      <div className={styles.lineItemsTableWrap}>
        <table className={styles.lineItemsTable}>
          <thead>
            <tr>
              <th>{t("invoices.lineItems.description", { defaultValue: "Description" })}</th>
              <th>{t("invoices.lineItems.quantity", { defaultValue: "Qty" })}</th>
              <th>{t("invoices.lineItems.unitPrice", { defaultValue: "Unit price" })}</th>
              <th>{t("invoices.lineItems.lineTotal", { defaultValue: "Line total" })}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const lineTotal = computeInvoiceLineItemTotal(row);
              return (
                <tr
                  key={row.id || `row-${index}`}
                  data-testid="invoice-line-item-row"
                >
                  <td>
                    <input
                      type="text"
                      className={styles.lineItemField}
                      value={row.description || row.label || ""}
                      disabled={disabled}
                      placeholder={t("invoices.lineItems.descriptionPlaceholder", {
                        defaultValue: "e.g. Labor, materials",
                      })}
                      data-testid="invoice-line-item-description"
                      onChange={(event) =>
                        updateRow(index, {
                          description: event.target.value,
                          label: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
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
                  </td>
                  <td>
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
                  </td>
                  <td className={styles.lineItemTotalCell}>
                    ${formatMoney(lineTotal)}
                  </td>
                  <td>
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.lineItemsFooter}>
        <button
          type="button"
          className={styles.btnGhost}
          disabled={disabled}
          data-testid="invoice-add-line-item"
          onClick={addRow}
        >
          {t("invoices.lineItems.add", { defaultValue: "Add line item" })}
        </button>
        <p className={styles.lineItemsSum} data-testid="invoice-line-items-total">
          {t("invoices.lineItems.subtotal", { defaultValue: "Line items subtotal" })}: $
          {formatMoney(lineItemsTotal)}
        </p>
      </div>
    </div>
  );
}
