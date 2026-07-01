"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import ClientPickerField from "@/components/clients/ClientPickerField";
import InvoiceLineItemsEditor from "@/components/invoices/InvoiceLineItemsEditor";
import styles from "@/app/invoices/invoices.module.css";

export default function InvoiceComposerForm({
  form,
  setForm,
  formTotals,
  selectedId,
  selectedInvoice,
  effectiveStatus,
  statusIsComputed,
  invoiceStatusOptions,
  paymentMethodOptions,
  onLineItemsChange,
  onSaveDraft,
  onSendInvoice,
  onReset,
  onRunAi,
  aiLoading,
  saving,
  sending,
}) {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hasDiscount = Number(formTotals?.discount || 0) > 0;

  return (
    <div className={styles.composerLayout} data-testid="invoice-composer">
      <div className={styles.composerMain}>
        <section className={styles.composerSection}>
          <h3 className={styles.composerSectionTitle}>
            {t("invoices.composer.clientSection", { defaultValue: "Client & dates" })}
          </h3>
          <div className={styles.composerFieldStack}>
            <div className={styles.composerField}>
              <label className={styles.formLabel} htmlFor="invoice-client">
                {t("invoices.labels.client", { defaultValue: "Client" })}
              </label>
              <ClientPickerField
                id="invoice-client"
                variant="light"
                clientId={form.clientId || ""}
                displayValue={form.clientName}
                showHint={false}
                placeholder={t("invoices.placeholders.client")}
                onChange={({ clientId, clientName, displayValue, client }) =>
                  setForm((prev) => ({
                    ...prev,
                    clientId: clientId || "",
                    clientName: clientName || displayValue || "",
                    clientEmail: client?.email || prev.clientEmail || "",
                  }))
                }
              />
            </div>

            <div className={styles.composerFieldRow}>
              <div className={styles.composerField}>
                <label className={styles.formLabel} htmlFor="invoice-date">
                  {t("invoices.labels.invoiceDate", { defaultValue: "Invoice date" })}
                </label>
                <input
                  id="invoice-date"
                  type="date"
                  className={styles.field}
                  value={form.invoiceDate || ""}
                  onChange={(e) =>
                    setForm({ ...form, invoiceDate: e.target.value })
                  }
                />
              </div>
              <div className={styles.composerField}>
                <label className={styles.formLabel} htmlFor="invoice-due">
                  {t("invoices.labels.dueDate", { defaultValue: "Due date" })}
                </label>
                <input
                  id="invoice-due"
                  type="date"
                  className={styles.field}
                  value={form.dueDate || ""}
                  onChange={(e) =>
                    setForm({ ...form, dueDate: e.target.value })
                  }
                />
              </div>
            </div>

            <div className={styles.composerField}>
              <label className={styles.formLabel} htmlFor="invoice-payment-method">
                {t("invoices.labels.paymentMethod", {
                  defaultValue: "Payment method",
                })}
              </label>
              <select
                id="invoice-payment-method"
                className={styles.field}
                value={form.preferredPaymentMethod}
                onChange={(e) =>
                  setForm({
                    ...form,
                    preferredPaymentMethod: e.target.value,
                  })
                }
              >
                {paymentMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className={styles.composerSection}>
          <InvoiceLineItemsEditor
            lineItems={form.lineItems}
            onChange={onLineItemsChange}
          />
        </section>

        <section className={styles.composerSection}>
          <button
            type="button"
            className={styles.advancedToggle}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <span>
              {t("invoices.composer.advancedOptions", {
                defaultValue: "Advanced options",
              })}
            </span>
            <span aria-hidden="true">{advancedOpen ? "−" : "+"}</span>
          </button>

          {advancedOpen ? (
            <div className={styles.advancedPanel}>
              <div className={styles.composerField}>
                <label className={styles.formLabel} htmlFor="invoice-number">
                  {t("invoices.labels.invoiceNumber", {
                    defaultValue: "Invoice number",
                  })}
                </label>
                <input
                  id="invoice-number"
                  className={styles.field}
                  placeholder={t("invoices.placeholders.invoiceNumberAuto")}
                  value={form.invoiceNumber}
                  onChange={(e) =>
                    setForm({ ...form, invoiceNumber: e.target.value })
                  }
                />
              </div>

              <div className={styles.composerField}>
                <label className={styles.formLabel} htmlFor="invoice-title">
                  {t("invoices.labels.invoiceTitle", {
                    defaultValue: "Invoice title",
                  })}
                </label>
                <input
                  id="invoice-title"
                  className={styles.field}
                  value={form.invoiceTitle}
                  onChange={(e) =>
                    setForm({ ...form, invoiceTitle: e.target.value })
                  }
                />
              </div>

              <div className={styles.composerField}>
                <label className={styles.formLabel} htmlFor="invoice-quote">
                  {t("invoices.labels.quoteNumber", {
                    defaultValue: "Estimate / quote #",
                  })}
                </label>
                <input
                  id="invoice-quote"
                  className={styles.field}
                  value={form.quoteNumber}
                  onChange={(e) =>
                    setForm({ ...form, quoteNumber: e.target.value })
                  }
                />
              </div>

              <div className={styles.composerField}>
                <label className={styles.formLabel} htmlFor="invoice-status">
                  {t("invoices.labels.status", { defaultValue: "Status" })}
                </label>
                {statusIsComputed ? (
                  <div className={styles.statusReadonly}>{effectiveStatus}</div>
                ) : (
                  <select
                    id="invoice-status"
                    className={styles.field}
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    {invoiceStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className={styles.composerField}>
                <label className={styles.formLabel} htmlFor="invoice-public-notes">
                  {t("invoices.labels.publicNotes", {
                    defaultValue: "Public notes",
                  })}
                </label>
                <textarea
                  id="invoice-public-notes"
                  className={styles.textarea}
                  rows={3}
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder={t("invoices.placeholders.workPerformed")}
                />
                <button
                  type="button"
                  className={styles.btnAiInline}
                  disabled={aiLoading}
                  onClick={onRunAi}
                >
                  {aiLoading
                    ? t("invoices.buttons.aiLoading")
                    : t("invoices.buttons.ai")}
                </button>
              </div>

              <div className={styles.composerField}>
                <label className={styles.formLabel} htmlFor="invoice-internal-notes">
                  {t("invoices.labels.internalNotes", {
                    defaultValue: "Internal notes",
                  })}
                </label>
                <textarea
                  id="invoice-internal-notes"
                  className={styles.textarea}
                  rows={3}
                  value={form.internalNotes}
                  onChange={(e) =>
                    setForm({ ...form, internalNotes: e.target.value })
                  }
                />
              </div>

              <p className={styles.advancedHint}>
                {t("invoices.composer.attachmentsHint", {
                  defaultValue:
                    "Attachments and custom fields can be added after saving the invoice.",
                })}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <aside className={styles.composerSummary}>
        <div className={styles.summaryCard} data-testid="invoice-form-summary">
          <h3 className={styles.summaryTitle}>
            {t("invoices.summary.title", { defaultValue: "Summary" })}
          </h3>
          <div className={styles.summaryRows}>
            <div className={styles.summaryRow}>
              <span>{t("invoices.summary.subtotal", { defaultValue: "Subtotal" })}</span>
              <span>${Number(formTotals.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>{t("invoices.summary.tax", { defaultValue: "Tax" })}</span>
              <span>${Number(formTotals.tax || 0).toFixed(2)}</span>
            </div>
            {hasDiscount ? (
              <div className={styles.summaryRow}>
                <span>{t("invoices.summary.discount", { defaultValue: "Discount" })}</span>
                <span>-${Number(formTotals.discount || 0).toFixed(2)}</span>
              </div>
            ) : null}
          </div>
          <div className={styles.summaryTotal}>
            <span>{t("invoices.summary.total", { defaultValue: "Total" })}</span>
            <span>${Number(formTotals.total || 0).toFixed(2)}</span>
          </div>

          <button
            type="button"
            className={styles.btnSend}
            disabled={sending || saving}
            data-testid="invoice-send-button"
            onClick={onSendInvoice}
          >
            {sending
              ? t("invoices.buttons.sending", { defaultValue: "Sending…" })
              : t("invoices.buttons.sendInvoice", {
                  defaultValue: "Send invoice",
                })}
          </button>

          <button
            type="button"
            className={styles.btnSaveDraft}
            disabled={saving || sending}
            onClick={onSaveDraft}
          >
            {saving
              ? t("invoices.buttons.saving", { defaultValue: "Saving…" })
              : selectedId
                ? t("invoices.buttons.update")
                : t("invoices.composer.saveDraft", {
                    defaultValue: "Save draft",
                  })}
          </button>

          <button type="button" className={styles.btnText} onClick={onReset}>
            {t("invoices.buttons.clear")}
          </button>

          {selectedId && selectedInvoice ? (
            <p className={styles.summaryMeta}>
              {selectedInvoice.invoiceNumber || selectedId}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
