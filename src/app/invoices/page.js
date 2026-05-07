"use client";
import { useCallback, useEffect, useState } from "react";
import UniversalShareButton from "@/components/UniversalShareButton";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import "@/i18n";

const initialInvoice = {
  invoiceNumber: "",
  clientName: "",
  invoiceTitle: "",
  quoteNumber: "",
  amount: "",
  dueDate: "",
  status: "Unpaid",
  preferredPaymentMethod: "bank_transfer",
  lineItemsText: "",
  notes: "",
};

const PAYMENT_METHOD_VALUES = [
  "bank_transfer",
  "credit_card",
  "debit_card",
  "cash",
  "check",
  "zelle",
  "venmo",
  "paypal",
  "other",
];

const paymentMethodOptions = (t) =>
  PAYMENT_METHOD_VALUES.map((value) => ({
    value,
    label:
      t(`invoices.paymentMethods.${value}`) ||
      t("invoices.paymentMethods.other"),
  }));

const paymentMethodLabel = (value, t) =>
  t(`invoices.paymentMethods.${value}`) || t("invoices.paymentMethods.other");

const normalizePhoneInput = (value) =>
  String(value || "")
    .trim()
    .replace(/[^\d+]/g, "");

const REFERENCE_REQUIRED_METHODS = new Set([
  "bank_transfer",
  "credit_card",
  "debit_card",
  "check",
  "zelle",
  "venmo",
  "paypal",
]);
const NOTES_REQUIRED_METHODS = new Set(["cash", "other"]);
const todayIso = () => new Date().toISOString().slice(0, 10);

const initialPaymentDraft = (invoice) => ({
  amount: String(invoice.balanceDue || invoice.amount || ""),
  method: invoice.preferredPaymentMethod || "bank_transfer",
  date: todayIso(),
  reference: "",
  notes: "",
});

const formatInvoiceLineItems = (lineItems = []) =>
  Array.isArray(lineItems)
    ? lineItems
        .map((item) => {
          const label = String(item?.label || "").trim();
          const details = String(item?.details || "").trim();
          const amount = String(item?.amount || "").trim();
          if (!label && !details && !amount) {
            return "";
          }

          const left = [label, details].filter(Boolean).join(" - ");
          return amount ? `${left} | $${amount}` : left;
        })
        .filter(Boolean)
        .join("\n")
    : "";

const parseInvoiceLineItems = (value = "") =>
  String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [leftPart, rightPart = ""] = line.split("|");
      const [label, ...detailParts] = leftPart.split(" - ");
      return {
        id: `manual-${index + 1}`,
        label: String(label || "").trim(),
        details: detailParts.join(" - ").trim(),
        amount: String(rightPart || "").replace(/[^0-9.]/g, ""),
      };
    });

const actionIconButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function IconPencil() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function InvoicesPage() {
  const { t } = useTranslation();
  const { capabilities } = useCurrentUserAccess();
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState(initialInvoice);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [paymentDraftById, setPaymentDraftById] = useState({});
  const [openPaymentFormId, setOpenPaymentFormId] = useState("");
  const [savingPaymentId, setSavingPaymentId] = useState("");
  const [error, setError] = useState("");

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const openPrintableReceipt = (invoice, payment) => {
    if (typeof window === "undefined") return;
    const popup = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=840,height=960",
    );
    if (!popup) return;

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${t("invoices.receipt.title")}</title>
      <style>body{font-family:Arial,sans-serif;padding:28px;color:#222}h1{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f5f5f5;width:35%}</style>
      </head><body>
      <h1>${t("invoices.receipt.title")}</h1>
      <p>${t("invoices.receipt.invoice")} ${escapeHtml(invoice.invoiceNumber || t("invoices.receipt.notAvailable"))}</p>
      <table><tbody>
      <tr><th>${t("invoices.receipt.client")}</th><td>${escapeHtml(invoice.clientName || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${t("invoices.receipt.invoiceTitle")}</th><td>${escapeHtml(invoice.invoiceTitle || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${t("invoices.receipt.paymentAmount")}</th><td>$${Number(payment.amount || 0).toFixed(2)}</td></tr>
      <tr><th>${t("invoices.receipt.method")}</th><td>${escapeHtml(paymentMethodLabel(payment.method, t))}</td></tr>
      <tr><th>${t("invoices.receipt.date")}</th><td>${escapeHtml(payment.date || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${t("invoices.receipt.reference")}</th><td>${escapeHtml(payment.reference || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${t("invoices.receipt.notes")}</th><td>${escapeHtml(payment.notes || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${t("invoices.receipt.paidTotal")}</th><td>$${Number(invoice.paidAmount || 0).toFixed(2)}</td></tr>
      <tr><th>${t("invoices.receipt.balanceDue")}</th><td>$${Number(invoice.balanceDue || 0).toFixed(2)}</td></tr>
      </tbody></table></body></html>`;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const validatePaymentDraft = (draft, invoice) => {
    const amount = Number(String(draft.amount || "").replace(/[^0-9.]/g, ""));
    const balance = Number(invoice.balanceDue || invoice.amount || 0);
    const method = String(draft.method || "other").toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0)
      return t("invoices.errors.invalidAmount");
    if (amount > balance)
      return (
        t("invoices.errors.paymentExceedsBalance") +
        ` ($${balance.toFixed(2)}).`
      );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.date || "")))
      return t("invoices.errors.paymentDateRequired");
    if (
      REFERENCE_REQUIRED_METHODS.has(method) &&
      !String(draft.reference || "").trim()
    )
      return t("invoices.errors.referenceRequired");
    if (NOTES_REQUIRED_METHODS.has(method) && !String(draft.notes || "").trim())
      return t("invoices.errors.notesRequired");
    return "";
  };

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/invoices");
      const data = await getJsonOrThrow(res, t("invoices.errors.fetch"));
      setInvoices(data);
    } catch (err) {

      setError(err.message || t("invoices.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const resetForm = () => {
    setForm(initialInvoice);
    setSelectedId(null);
  };

  const saveInvoice = async () => {
    try {
      const method = selectedId ? "PATCH" : "POST";
      const url = selectedId ? `/api/invoices/${selectedId}` : "/api/invoices";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lineItems: parseInvoiceLineItems(form.lineItemsText),
        }),
      });
      const result = await getJsonOrThrow(res, t("invoices.errors.save"));

      setInvoices(
        selectedId
          ? invoices.map((invoice) =>
              invoice._id === selectedId ? result.data : invoice,
            )
          : [result.data, ...invoices],
      );
      resetForm();
    } catch (err) {

      setError(err.message || t("invoices.errors.saveFallback"));
    }
  };

  const runInvoiceAI = async () => {
    setAiLoading(true);
    setError("");

    try {
      const res = await apiFetch("/api/ai/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await getJsonOrThrow(res, t("invoices.errors.ai"));
      setForm((current) => ({
        ...current,
        amount: result.data.amount || current.amount,
        dueDate: result.data.dueDate || current.dueDate,
        invoiceTitle: result.data.invoiceTitle || current.invoiceTitle,
        lineItemsText: result.data.lineItems?.length
          ? formatInvoiceLineItems(result.data.lineItems)
          : current.lineItemsText,
        notes: result.data.notes || current.notes,
      }));
    } catch (err) {

      setError(err.message || t("invoices.errors.aiFallback"));
    } finally {
      setAiLoading(false);
    }
  };

  const editInvoice = (invoice) => {
    setForm({
      invoiceNumber: invoice.invoiceNumber || "",
      clientName: invoice.clientName || "",
      invoiceTitle: invoice.invoiceTitle || "",
      quoteNumber: invoice.quoteNumber || "",
      amount: invoice.amount || "",
      dueDate: invoice.dueDate || "",
      status: invoice.status || "Unpaid",
      preferredPaymentMethod: invoice.preferredPaymentMethod || "bank_transfer",
      lineItemsText:
        invoice.lineItemsText || formatInvoiceLineItems(invoice.lineItems),
      notes: invoice.notes || "",
    });
    setSelectedId(invoice._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteInvoice = async (id) => {
    try {
      const res = await apiFetch(`/api/invoices/${id}`, { method: "DELETE" });
      await getJsonOrThrow(res, t("invoices.errors.delete"));
      setInvoices(invoices.filter((invoice) => invoice._id !== id));
      if (selectedId === id) resetForm();
    } catch (err) {

      setError(err.message || t("invoices.errors.deleteFallback"));
    }
  };

  const startRegisterPayment = (invoice) => {
    setOpenPaymentFormId(invoice._id);
    setPaymentDraftById((current) => ({
      ...current,
      [invoice._id]: current[invoice._id] || initialPaymentDraft(invoice),
    }));
    setError("");
  };

  const registerPayment = async (invoice) => {
    const draft = paymentDraftById[invoice._id] || initialPaymentDraft(invoice);
    const validationError = validatePaymentDraft(draft, invoice);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingPaymentId(invoice._id);
    setError("");
    try {
      const res = await apiFetch(`/api/invoices/${invoice._id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: draft.amount,
          method: draft.method,
          date: draft.date,
          reference: draft.reference,
          notes: draft.notes,
        }),
      });
      const result = await getJsonOrThrow(
        res,
        t("invoices.errors.registerPayment"),
      );
      setInvoices((current) =>
        current.map((item) => (item._id === invoice._id ? result.data : item)),
      );
      setOpenPaymentFormId("");
      setPaymentDraftById((current) => {
        const next = { ...current };
        delete next[invoice._id];
        return next;
      });
      openPrintableReceipt(
        result.data,
        result.data.payments?.[result.data.payments.length - 1] || draft,
      );
      if (selectedId === invoice._id) {
        editInvoice(result.data);
      }
    } catch (err) {

      setError(err.message || t("invoices.errors.registerPaymentFallback"));
    } finally {
      setSavingPaymentId("");
    }
  };

  const getInvoiceCheckoutUrl = useCallback(
    async (invoice) => {
      const res = await apiFetch(`/api/invoices/${invoice._id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: invoice.balanceDue || invoice.amount }),
      });
      const result = await getJsonOrThrow(
        res,
        t("invoices.errors.startOnlinePayment"),
      );
      const checkoutUrl = result?.data?.checkoutUrl;
      if (!checkoutUrl) {
        throw new Error(t("invoices.errors.stripeCheckoutMissing"));
      }
      return checkoutUrl;
    },
    [t],
  );

  const payOnline = async (invoice) => {
    try {
      const checkoutUrl = await getInvoiceCheckoutUrl(invoice);
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    } catch (err) {

      setError(err.message || t("invoices.errors.openCheckoutFallback"));
    }
  };

  const sendInvoiceEmail = async (invoice) => {
    try {
      const suggested = String(invoice.clientEmail || "")
        .trim()
        .toLowerCase();
      const promptValue = window.prompt(
        t("invoices.prompts.recipientEmail"),
        suggested,
      );
      if (promptValue === null) return;

      const recipientEmail = String(promptValue || "")
        .trim()
        .toLowerCase();

      const res = await apiFetch(`/api/invoices/${invoice._id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipientEmail ? { recipientEmail } : {}),
      });
      const result = await getJsonOrThrow(
        res,
        t("invoices.errors.sendInvoice"),
      );

      if (result?.data?.invoice?._id) {
        setInvoices((current) =>
          current.map((item) =>
            item._id === invoice._id
              ? {
                  ...item,
                  ...result.data.invoice,
                }
              : item,
          ),
        );
      }

      const sentTo = result?.data?.recipientEmail || recipientEmail;
      if (sentTo) {
        window.alert(t("invoices.messages.invoiceSent", { email: sentTo }));
      }
    } catch (err) {

      setError(err.message || t("invoices.errors.sendInvoiceFallback"));
    }
  };

  const sendInvoiceText = async (invoice) => {
    try {
      const suggested = String(invoice.clientPhone || "").trim();
      const promptValue = window.prompt(
        t("invoices.prompts.recipientPhone"),
        suggested,
      );
      if (promptValue === null) return;

      const recipientPhone = normalizePhoneInput(promptValue);
      if (!recipientPhone || recipientPhone.length < 7) {
        throw new Error(t("invoices.errors.invalidRecipientPhone"));
      }

      const checkoutUrl = await getInvoiceCheckoutUrl(invoice);
      const amount = Number(invoice.balanceDue || invoice.amount || 0).toFixed(
        2,
      );
      const smsBody = t("invoices.messages.invoiceTextMessage", {
        invoice: invoice.invoiceNumber || t("invoices.labels.untitled"),
        amount,
        link: checkoutUrl,
      });

      window.location.href = `sms:${recipientPhone}?body=${encodeURIComponent(smsBody)}`;
      window.alert(
        t("invoices.messages.invoiceTextOpened", { phone: recipientPhone }),
      );
    } catch (err) {

      setError(err.message || t("invoices.errors.sendInvoiceTextFallback"));
    }
  };

  const resolveInvoiceShareData = useCallback(
    async (invoice) => {
      const checkoutUrl = await getInvoiceCheckoutUrl(invoice);
      const amount = Number(invoice.balanceDue || invoice.amount || 0).toFixed(2);
      return {
        title: `${t("invoices.title")}: ${invoice.invoiceNumber || t("invoices.labels.untitled")}`,
        text: t("invoices.messages.invoiceShareText", {
          invoice: invoice.invoiceNumber || t("invoices.labels.untitled"),
          amount,
        }),
        url: checkoutUrl,
      };
    },
    [getInvoiceCheckoutUrl, t],
  );

  return (
    <main
      style={{
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "32px", margin: 0 }}>{t("invoices.title")}</h1>
          <p style={{ margin: "10px 0 0 0", color: "#555" }}>
            {t("invoices.description")}
          </p>
        </div>
      </header>

      {error && (
        <div style={{ marginTop: "20px", color: "#b00020" }}>{error}</div>
      )}
      {loading && (
        <div style={{ marginTop: "20px", color: "#333" }}>
          {t("invoices.loading")}
        </div>
      )}

      {capabilities.canManageSensitiveData
        ? <section
            style={{
              marginTop: "24px",
              padding: "20px",
              border: "1px solid #ddd",
              borderRadius: "16px",
              background: "#fff",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              {selectedId
                ? t("invoices.formTitleEdit")
                : t("invoices.formTitleNew")}
            </h2>
            <div style={{ display: "grid", gap: "12px" }}>
              <input
                placeholder={t("invoices.placeholders.invoiceNumber")}
                value={form.invoiceNumber}
                onChange={(e) =>
                  setForm({ ...form, invoiceNumber: e.target.value })
                }
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
              <input
                placeholder={t("invoices.placeholders.client")}
                value={form.clientName}
                onChange={(e) =>
                  setForm({ ...form, clientName: e.target.value })
                }
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
              <input
                placeholder={t("invoices.placeholders.invoiceTitle")}
                value={form.invoiceTitle}
                onChange={(e) =>
                  setForm({ ...form, invoiceTitle: e.target.value })
                }
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
              <input
                placeholder="Quote ID"
                value={form.quoteNumber}
                onChange={(e) =>
                  setForm({ ...form, quoteNumber: e.target.value })
                }
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
              <input
                placeholder={t("invoices.placeholders.amount")}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              />
              <select
                value={form.preferredPaymentMethod}
                onChange={(e) =>
                  setForm({ ...form, preferredPaymentMethod: e.target.value })
                }
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                }}
              >
                {paymentMethodOptions(t).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <textarea
                placeholder={t("invoices.placeholders.lineItems")}
                value={form.lineItemsText}
                onChange={(e) =>
                  setForm({ ...form, lineItemsText: e.target.value })
                }
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                  minHeight: "110px",
                }}
              />
              <textarea
                placeholder={t("invoices.placeholders.notes")}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #ccc",
                  minHeight: "100px",
                }}
              />
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={runInvoiceAI}
                  disabled={aiLoading}
                  style={{
                    padding: "12px 20px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: "white",
                    cursor: aiLoading ? "wait" : "pointer",
                  }}
                >
                  {aiLoading
                    ? t("invoices.buttons.aiLoading")
                    : t("invoices.buttons.ai")}
                </button>
                <button
                  type="button"
                  onClick={saveInvoice}
                  style={{
                    padding: "12px 20px",
                    borderRadius: "10px",
                    border: "none",
                    background: "black",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {selectedId
                    ? t("invoices.buttons.update")
                    : t("invoices.buttons.save")}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    padding: "12px 20px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  {t("invoices.buttons.clear")}
                </button>
              </div>
            </div>
          </section>
        : null}

      <section style={{ marginTop: "24px" }}>
        <h2>{t("invoices.listTitle")}</h2>
        <div style={{ display: "grid", gap: "14px" }}>
          {invoices.map((invoice) => (
            <div
              key={invoice._id}
              style={{
                padding: "18px",
                border: "1px solid #ddd",
                borderRadius: "14px",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>
                    {invoice.invoiceNumber || t("invoices.labels.untitled")}
                  </h3>
                  <p style={{ margin: "8px 0 0 0", color: "#555" }}>
                    {invoice.clientName} |{" "}
                    {t(`invoices.statusOptions.${invoice.status}`) ||
                      invoice.status}
                  </p>
                  {invoice.invoiceTitle
                    ? <p style={{ margin: "8px 0 0 0", color: "#444" }}>
                        {invoice.invoiceTitle}
                      </p>
                    : null}
                  {invoice.quoteNumber
                    ? <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        Quote ID: {invoice.quoteNumber}
                      </p>
                    : null}
                  <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                    {t("invoices.labels.amount")}: ${invoice.amount}
                  </p>
                  <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                    {t("invoices.labels.paid")}: $
                    {Number(invoice.paidAmount || 0).toFixed(2)} |
                    {t("invoices.labels.balance")}: $
                    {Number(invoice.balanceDue || invoice.amount || 0).toFixed(
                      2,
                    )}
                  </p>
                  <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                    {t("invoices.labels.preferredMethod")}:{" "}
                    {paymentMethodLabel(invoice.preferredPaymentMethod, t)}
                  </p>
                  <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                    {t("invoices.labels.dueDate")}:{" "}
                    {invoice.dueDate || t("invoices.labels.noDate")}
                  </p>
                  {invoice.lineItems?.length
                    ? <p
                        style={{
                          margin: "8px 0 0 0",
                          color: "#777",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {formatInvoiceLineItems(invoice.lineItems)}
                      </p>
                    : null}
                  {invoice.payments?.length
                    ? <p
                        style={{
                          margin: "8px 0 0 0",
                          color: "#4a4a4a",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {invoice.payments
                          .map(
                            (item) =>
                              `- ${item.date}: $${Number(item.amount || 0).toFixed(2)} (${paymentMethodLabel(item.method, t)})${item.reference ? ` ${t("invoices.labels.paymentRefPrefix")} ${item.reference}` : ""}`,
                          )
                          .join("\n")}
                      </p>
                    : null}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {capabilities.canSendExternalCommunications
                    ? <button
                        type="button"
                        onClick={() => sendInvoiceEmail(invoice)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#0f766e",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        {t("invoices.buttons.sendInvoiceEmail")}
                      </button>
                    : null}
                  {capabilities.canSendExternalCommunications
                    ? <button
                        type="button"
                        onClick={() => sendInvoiceText(invoice)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#1d4ed8",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        {t("invoices.buttons.sendInvoiceText")}
                      </button>
                    : null}
                  {capabilities.canSendExternalCommunications ? (
                    <UniversalShareButton
                      label={t("invoices.buttons.shareInvoice")}
                      copiedLabel={t("invoices.messages.invoiceLinkCopied")}
                      copyFailedLabel={t("invoices.errors.shareInvoiceFallback")}
                      resolveShareData={() => resolveInvoiceShareData(invoice)}
                      style={{
                        padding: "10px 16px",
                        minHeight: 0,
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    />
                  ) : null}
                  {capabilities.canManageSensitiveData
                    ? <button
                        type="button"
                        onClick={() => payOnline(invoice)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#635bff",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        {t("invoices.buttons.chargeOnline")}
                      </button>
                    : null}
                  {capabilities.canManageSensitiveData
                    ? <button
                        type="button"
                        onClick={() => startRegisterPayment(invoice)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#1d6f42",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        {t("invoices.buttons.registerPayment")}
                      </button>
                    : null}
                  {capabilities.canManageSensitiveData
                    ? <button
                        type="button"
                        onClick={() => editInvoice(invoice)}
                        style={actionIconButtonStyle}
                      >
                        <IconPencil />
                        {t("invoices.buttons.edit")}
                      </button>
                    : null}
                  {capabilities.canDeleteRecords
                    ? <button
                        type="button"
                        onClick={() => deleteInvoice(invoice._id)}
                        style={{
                          ...actionIconButtonStyle,
                          border: "1px solid #fecaca",
                          color: "#b91c1c",
                        }}
                      >
                        <IconTrash />
                        {t("invoices.buttons.delete")}
                      </button>
                    : null}
                </div>
              </div>
              {openPaymentFormId === invoice._id
                ? <div
                    style={{
                      marginTop: "12px",
                      padding: "12px",
                      border: "1px solid #d9e3d9",
                      borderRadius: "10px",
                      background: "#f7fbf7",
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    <strong>{t("invoices.labels.paymentFormTitle")}</strong>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "10px",
                      }}
                    >
                      <input
                        placeholder={t("invoices.placeholders.paymentAmount")}
                        value={paymentDraftById[invoice._id]?.amount || ""}
                        onChange={(e) =>
                          setPaymentDraftById((current) => ({
                            ...current,
                            [invoice._id]: {
                              ...(current[invoice._id] ||
                                initialPaymentDraft(invoice)),
                              amount: e.target.value,
                            },
                          }))
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #cfd4dd",
                        }}
                      />
                      <input
                        type="date"
                        value={
                          paymentDraftById[invoice._id]?.date || todayIso()
                        }
                        onChange={(e) =>
                          setPaymentDraftById((current) => ({
                            ...current,
                            [invoice._id]: {
                              ...(current[invoice._id] ||
                                initialPaymentDraft(invoice)),
                              date: e.target.value,
                            },
                          }))
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #cfd4dd",
                        }}
                      />
                      <select
                        value={
                          paymentDraftById[invoice._id]?.method ||
                          invoice.preferredPaymentMethod ||
                          "bank_transfer"
                        }
                        onChange={(e) =>
                          setPaymentDraftById((current) => ({
                            ...current,
                            [invoice._id]: {
                              ...(current[invoice._id] ||
                                initialPaymentDraft(invoice)),
                              method: e.target.value,
                            },
                          }))
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #cfd4dd",
                        }}
                      >
                        {paymentMethodOptions(t).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder={t("invoices.placeholders.reference")}
                        value={paymentDraftById[invoice._id]?.reference || ""}
                        onChange={(e) =>
                          setPaymentDraftById((current) => ({
                            ...current,
                            [invoice._id]: {
                              ...(current[invoice._id] ||
                                initialPaymentDraft(invoice)),
                              reference: e.target.value,
                            },
                          }))
                        }
                        style={{
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #cfd4dd",
                        }}
                      />
                    </div>
                    <textarea
                      placeholder={t("invoices.placeholders.paymentNotes")}
                      value={paymentDraftById[invoice._id]?.notes || ""}
                      onChange={(e) =>
                        setPaymentDraftById((current) => ({
                          ...current,
                          [invoice._id]: {
                            ...(current[invoice._id] ||
                              initialPaymentDraft(invoice)),
                            notes: e.target.value,
                          },
                        }))
                      }
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid #cfd4dd",
                        minHeight: "72px",
                      }}
                    />
                    <div
                      style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
                    >
                      <button
                        type="button"
                        onClick={() => registerPayment(invoice)}
                        disabled={savingPaymentId === invoice._id}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#1d6f42",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {savingPaymentId === invoice._id
                          ? t("invoices.buttons.savingPayment")
                          : t("invoices.buttons.savePayment")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenPaymentFormId("")}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid #ccc",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {t("invoices.buttons.cancel")}
                      </button>
                    </div>
                  </div>
                : null}
            </div>
          ))}
          {invoices.length === 0 && !loading && (
            <p style={{ color: "#777" }}>{t("invoices.empty")}</p>
          )}
        </div>
      </section>
    </main>
  );
}
