"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import ClientPickerField from "@/components/clients/ClientPickerField";
import InvoiceLineItemsEditor from "@/components/invoices/InvoiceLineItemsEditor";
import styles from "@/app/invoices/invoices.module.css";

export default function InvoiceBuilder({
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
  onPreview,
  onSendInvoice,
  onBack,
  onRunAi,
  aiLoading,
  saving,
  sending,
  autoSaveLabel,
  isDirty,
}) {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isEdit = Boolean(selectedId);
  const hasDiscount = Number(formTotals?.discount || 0) > 0;

  return (
    <div
      className={styles.builderShell}
      data-testid="invoices-form-section"
    >
      <div className={styles.builderTopBar}>
        <button
          type="button"
          className={styles.builderBack}
          onClick={onBack}
          data-testid="invoice-builder-back"
        >
          <span aria-hidden="true">←</span>
          {t("invoices.builder.backToList", {
            defaultValue: "Back to Invoices",
          })}
        </button>
        {autoSaveLabel ? (
          <span className={styles.builderAutoSave} aria-live="polite">
            {autoSaveLabel}
          </span>
        ) : isDirty ? (
          <span className={styles.builderUnsaved}>
            {t("invoices.builder.unsaved", { defaultValue: "Unsaved changes" })}
          </span>
        ) : null}
      </div>

      <div className={styles.builderLayout}>
        <div className={styles.builderMain}>
          <header className={styles.builderHeader}>
            <h1 className={styles.builderTitle}>
              {isEdit
                ? t("invoices.formTitleEdit")
                : t("invoices.formTitleNew")}
            </h1>
            {isEdit && effectiveStatus ? (
              <span
                className={`${styles.statusBadge} ${styles[`statusBadge_${String(effectiveStatus).toLowerCase()}`] || ""}`}
              >
                {t(`invoices.statusOptions.${effectiveStatus}`, {
                  defaultValue: effectiveStatus,
                })}
              </span>
            ) : null}
          </header>

          <section className={styles.builderBlock}>
            <div className={styles.builderFieldGrid}>
              <div className={styles.builderFieldWide}>
                <label className={styles.builderLabel} htmlFor="invoice-client">
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

              <div className={styles.builderField}>
                <label className={styles.builderLabel} htmlFor="invoice-date">
                  {t("invoices.labels.invoiceDate", {
                    defaultValue: "Invoice date",
                  })}
                </label>
                <input
                  id="invoice-date"
                  type="date"
                  className={styles.builderInput}
                  value={form.invoiceDate || ""}
                  onChange={(e) =>
                    setForm({ ...form, invoiceDate: e.target.value })
                  }
                />
              </div>

              <div className={styles.builderField}>
                <label className={styles.builderLabel} htmlFor="invoice-due">
                  {t("invoices.labels.dueDate", { defaultValue: "Due date" })}
                </label>
                <input
                  id="invoice-due"
                  type="date"
                  className={styles.builderInput}
                  value={form.dueDate || ""}
                  onChange={(e) =>
                    setForm({ ...form, dueDate: e.target.value })
                  }
                />
              </div>

              <div className={styles.builderField}>
                <label
                  className={styles.builderLabel}
                  htmlFor="invoice-payment-method"
                >
                  {t("invoices.labels.paymentMethod", {
                    defaultValue: "Payment method",
                  })}
                </label>
                <select
                  id="invoice-payment-method"
                  className={styles.builderInput}
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

          <section className={styles.builderBlock}>
            <h2 className={styles.builderSectionTitle}>
              {t("invoices.lineItems.title", { defaultValue: "Items" })}
            </h2>
            <InvoiceLineItemsEditor
              lineItems={form.lineItems}
              onChange={onLineItemsChange}
            />
          </section>

          <section className={styles.builderBlock}>
            <div className={styles.builderNotesHead}>
              <label className={styles.builderLabel} htmlFor="invoice-notes">
                {t("invoices.labels.workPerformed", {
                  defaultValue: "Notes",
                })}
              </label>
              <button
                type="button"
                className={styles.builderAiBtn}
                disabled={aiLoading}
                onClick={onRunAi}
              >
                {aiLoading
                  ? t("invoices.buttons.aiLoading")
                  : t("invoices.buttons.ai")}
              </button>
            </div>
            <textarea
              id="invoice-notes"
              className={styles.builderTextarea}
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("invoices.placeholders.workPerformed")}
            />
          </section>

          <section className={styles.builderBlock}>
            <button
              type="button"
              className={styles.builderAdvancedToggle}
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {t("invoices.composer.advancedOptions", {
                defaultValue: "Advanced options",
              })}
              <span aria-hidden="true">{advancedOpen ? "−" : "+"}</span>
            </button>

            {advancedOpen ? (
              <div className={styles.builderAdvanced}>
                <div className={styles.builderField}>
                  <label className={styles.builderLabel} htmlFor="invoice-number">
                    {t("invoices.labels.invoiceNumber", {
                      defaultValue: "Invoice number",
                    })}
                  </label>
                  <input
                    id="invoice-number"
                    className={styles.builderInput}
                    placeholder={t("invoices.placeholders.invoiceNumberAuto")}
                    value={form.invoiceNumber}
                    onChange={(e) =>
                      setForm({ ...form, invoiceNumber: e.target.value })
                    }
                  />
                </div>

                <div className={styles.builderField}>
                  <label className={styles.builderLabel} htmlFor="invoice-title">
                    {t("invoices.labels.invoiceTitle", {
                      defaultValue: "Invoice title",
                    })}
                  </label>
                  <input
                    id="invoice-title"
                    className={styles.builderInput}
                    value={form.invoiceTitle}
                    onChange={(e) =>
                      setForm({ ...form, invoiceTitle: e.target.value })
                    }
                  />
                </div>

                <div className={styles.builderField}>
                  <label className={styles.builderLabel} htmlFor="invoice-quote">
                    {t("invoices.labels.quoteNumber", {
                      defaultValue: "Estimate / quote #",
                    })}
                  </label>
                  <input
                    id="invoice-quote"
                    className={styles.builderInput}
                    value={form.quoteNumber}
                    onChange={(e) =>
                      setForm({ ...form, quoteNumber: e.target.value })
                    }
                  />
                </div>

                <div className={styles.builderField}>
                  <label className={styles.builderLabel} htmlFor="invoice-amount">
                    {t("invoices.labels.amount", { defaultValue: "Amount" })}
                  </label>
                  <input
                    id="invoice-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className={styles.builderInput}
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                  />
                </div>

                <div className={styles.builderField}>
                  <label className={styles.builderLabel} htmlFor="invoice-status">
                    {t("invoices.labels.status", { defaultValue: "Status" })}
                  </label>
                  {statusIsComputed ? (
                    <div className={styles.builderStatusReadonly}>
                      {effectiveStatus}
                    </div>
                  ) : (
                    <select
                      id="invoice-status"
                      className={styles.builderInput}
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

                <div className={styles.builderField}>
                  <label
                    className={styles.builderLabel}
                    htmlFor="invoice-internal-notes"
                  >
                    {t("invoices.labels.internalNotes", {
                      defaultValue: "Internal notes",
                    })}
                  </label>
                  <textarea
                    id="invoice-internal-notes"
                    className={styles.builderTextarea}
                    rows={3}
                    value={form.internalNotes}
                    onChange={(e) =>
                      setForm({ ...form, internalNotes: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className={styles.builderSidebar} data-testid="invoice-composer">
          <div className={styles.builderSummary} data-testid="invoice-form-summary">
            <div className={styles.builderSummaryRows}>
              <div className={styles.builderSummaryRow}>
                <span>
                  {t("invoices.summary.subtotal", { defaultValue: "Subtotal" })}
                </span>
                <span>${Number(formTotals.subtotal || 0).toFixed(2)}</span>
              </div>
              <div className={styles.builderSummaryRow}>
                <span>{t("invoices.summary.tax", { defaultValue: "Tax" })}</span>
                <span>${Number(formTotals.tax || 0).toFixed(2)}</span>
              </div>
              {hasDiscount ? (
                <div className={styles.builderSummaryRow}>
                  <span>
                    {t("invoices.summary.discount", {
                      defaultValue: "Discount",
                    })}
                  </span>
                  <span>-${Number(formTotals.discount || 0).toFixed(2)}</span>
                </div>
              ) : null}
            </div>

            <div
              className={styles.builderSummaryTotal}
              data-testid="invoice-line-items-total"
            >
              <span>{t("invoices.summary.total", { defaultValue: "Total" })}</span>
              <span>${Number(formTotals.total || 0).toFixed(2)}</span>
            </div>

            <div className={styles.builderSidebarActions}>
              <button
                type="button"
                className={styles.builderBtnPrimary}
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
                className={styles.builderBtnSecondary}
                disabled={saving || sending}
                onClick={onSaveDraft}
              >
                {saving
                  ? t("invoices.buttons.saving", { defaultValue: "Saving…" })
                  : isEdit
                    ? t("invoices.buttons.update")
                    : t("invoices.composer.saveDraft", {
                        defaultValue: "Save draft",
                      })}
              </button>

              <button
                type="button"
                className={styles.builderBtnGhost}
                disabled={saving || sending}
                onClick={onPreview}
              >
                {t("invoices.buttons.pdfPreview", {
                  defaultValue: "Preview",
                })}
              </button>
            </div>

            {selectedId && selectedInvoice ? (
              <p className={styles.builderMeta}>
                {selectedInvoice.invoiceNumber || selectedId}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <div className={styles.builderMobileBar}>
        <button
          type="button"
          className={styles.builderBtnSecondary}
          disabled={saving || sending}
          onClick={onSaveDraft}
        >
          {saving
            ? t("invoices.buttons.saving")
            : t("invoices.composer.saveDraft", { defaultValue: "Save draft" })}
        </button>
        <button
          type="button"
          className={styles.builderBtnGhost}
          disabled={saving || sending}
          onClick={onPreview}
        >
          {t("invoices.buttons.pdfPreview", { defaultValue: "Preview" })}
        </button>
        <button
          type="button"
          className={styles.builderBtnPrimary}
          disabled={sending || saving}
          onClick={onSendInvoice}
        >
          {sending
            ? t("invoices.buttons.sending")
            : t("invoices.buttons.sendInvoice", { defaultValue: "Send" })}
        </button>
      </div>
    </div>
  );
}
