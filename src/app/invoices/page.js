"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ClientPickerField from "@/components/clients/ClientPickerField";
import InvoiceClientPaymentsGuide from "@/components/invoices/InvoiceClientPaymentsGuide";
import InvoiceLineItemsEditor from "@/components/invoices/InvoiceLineItemsEditor";
import styles from "./invoices.module.css";
import UniversalShareButton from "@/components/UniversalShareButton";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import DocumentPdfActions from "@/components/workspace/DocumentPdfActions";
import {
  escapeHtml,
  openPrintableHtmlDocument,
} from "@/lib/print-html-document";
import { filterAndRankRecords } from "@/lib/record-search";
import {
  computeInvoiceLineItemTotal,
  createInvoiceLineItem,
  formatInvoiceLineItemsForList,
  getInvoiceLineItemDescription,
  hasDisplayableInvoiceLineItems,
  normalizeInvoiceLineItemsForForm,
  normalizeInvoiceLineItemsForSave,
  sumInvoiceLineItemsTotals,
} from "@/lib/invoice-line-items";
import { buildFieldBasePoweredByHtml } from "@/lib/fieldbase-document-branding";
import { buildInvoicePartyHtmlBlock } from "@/lib/invoice-party";
import { buildInvoicePaymentInstructions } from "@/lib/invoice-client-payment-instructions";
import { isPositiveMoney, requireNonEmptyString } from "@/lib/field-validation";
import "@/i18n";

const initialInvoice = {
  invoiceNumber: "",
  clientId: "",
  clientName: "",
  invoiceTitle: "",
  quoteNumber: "",
  amount: "",
  dueDate: "",
  status: "Unpaid",
  preferredPaymentMethod: "bank_transfer",
  lineItems: [createInvoiceLineItem("line-1")],
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
  const router = useRouter();
  const { capabilities } = useCurrentUserAccess();
  const stripePublishableConfigured = Boolean(
    String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim(),
  );
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState(initialInvoice);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [paymentDraftById, setPaymentDraftById] = useState({});
  const [openPaymentFormId, setOpenPaymentFormId] = useState("");
  const [savingPaymentId, setSavingPaymentId] = useState("");
  const searchParams = useSearchParams();
  const showClientPaymentsBanner =
    searchParams.get("focus") === "client-payments";
  const [paymentNotice, setPaymentNotice] = useState("");
  const [error, setError] = useState("");
  const [quoteLookup, setQuoteLookup] = useState(null);
  const [quoteLookupLoading, setQuoteLookupLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");

  const filterClientId = String(searchParams.get("clientId") || "").trim();
  const canEditInvoices = capabilities.canWriteOperationalData;
  const canManageInvoicePayments = capabilities.canManageSensitiveData;
  const formSectionRef = useRef(null);

  const visibleInvoices = useMemo(() => {
    let list = invoices;
    if (filterClientId) {
      list = list.filter(
        (invoice) => String(invoice.clientId || "") === filterClientId,
      );
    }
    if (listSearch.trim()) {
      list = filterAndRankRecords(list, listSearch, (invoice) => [
        invoice.invoiceNumber,
        invoice.clientName,
        invoice.invoiceTitle,
        invoice.quoteNumber,
        invoice.status,
      ]);
    }
    return list;
  }, [invoices, filterClientId, listSearch]);

  const mapUiError = (err, fallbackText) => {
    const raw = String(err?.message || "").trim();
    if (!raw) return fallbackText;
    if (
      /missing\s+stripe_secret_key/i.test(raw) ||
      /online payments are not configured/i.test(raw)
    ) {
      return t("invoices.errors.stripeCheckoutMissing");
    }
    return raw;
  };

  const handleLineItemsChange = (lineItems) => {
    const total = sumInvoiceLineItemsTotals(lineItems);
    setForm((prev) => ({
      ...prev,
      lineItems,
      amount: total > 0 ? String(total) : prev.amount,
    }));
  };

  const openPrintableInvoice = async (invoice) => {
    let printableInvoice = invoice;
    try {
      const res = await apiFetch(`/api/invoices/${invoice._id}`);
      if (res.ok) {
        const fresh = await res.json();
        printableInvoice = { ...invoice, ...(fresh?.data || fresh) };
      }
    } catch {
      printableInvoice = invoice;
    }

    const printableItems = normalizeInvoiceLineItemsForSave(printableInvoice.lineItems);
    const lineRows = printableItems
      .map((line) => {
        const qty = Number(line.quantity ?? line.qty ?? 1) || 1;
        const unit = Number(line.unitPrice || 0);
        const total = computeInvoiceLineItemTotal(line);
        const label = escapeHtml(getInvoiceLineItemDescription(line));
        const detail =
          qty > 1 || unit > 0
            ? `${qty} × $${unit.toFixed(2)} = $${total.toFixed(2)}`
            : `$${total.toFixed(2)}`;
        return `<tr><td>${label}</td><td>${escapeHtml(detail)}</td></tr>`;
      })
      .join("");
    const lineTable = lineRows
      ? `<table><thead><tr><th>${escapeHtml(t("invoices.lineItems.title", { defaultValue: "Line items" }))}</th><th>${escapeHtml(t("invoices.labels.amount", { defaultValue: "Amount" }))}</th></tr></thead><tbody>${lineRows}</tbody></table>`
      : "";
    const partyHtml = buildInvoicePartyHtmlBlock(printableInvoice);
    const bodyHtml = `
      <h1>${escapeHtml(t("invoices.listTitle", { defaultValue: "Invoice" }))}</h1>
      <p class="meta">${escapeHtml(printableInvoice.invoiceNumber || "")} · ${escapeHtml(printableInvoice.clientName || "")}</p>
      ${partyHtml}
      <table><tbody>
        <tr><th>${escapeHtml(t("invoices.labels.amount", { defaultValue: "Amount" }))}</th><td>$${Number(printableInvoice.amount || 0).toFixed(2)}</td></tr>
        <tr><th>${escapeHtml(t("invoices.labels.paid", { defaultValue: "Paid" }))}</th><td>$${Number(printableInvoice.paidAmount || 0).toFixed(2)}</td></tr>
        <tr><th>${escapeHtml(t("invoices.labels.balance", { defaultValue: "Balance" }))}</th><td>$${Number(printableInvoice.balanceDue || printableInvoice.amount || 0).toFixed(2)}</td></tr>
        <tr><th>${escapeHtml(t("invoices.labels.dueDate", { defaultValue: "Due date" }))}</th><td>${escapeHtml(printableInvoice.dueDate || "—")}</td></tr>
        <tr><th>${escapeHtml(t("invoices.labels.status", { defaultValue: "Status" }))}</th><td>${escapeHtml(printableInvoice.status || "")}</td></tr>
      </tbody></table>
      ${lineTable}
      ${printableInvoice.notes ? `<p><strong>${escapeHtml(t("invoices.placeholders.notes", { defaultValue: "Notes" }))}</strong><br/>${escapeHtml(printableInvoice.notes)}</p>` : ""}
      ${buildFieldBasePoweredByHtml()}`;
    const opened = openPrintableHtmlDocument({
      title: `Invoice ${printableInvoice.invoiceNumber || ""}`,
      bodyHtml,
    });
    if (!opened) {
      setError(
        t("invoices.errors.printBlocked", {
          defaultValue: "Allow pop-ups to print this invoice.",
        }),
      );
    }
  };

  const openPrintableReceipt = (invoice, payment) => {
    const bodyHtml = `
      <h1>${escapeHtml(t("invoices.receipt.title"))}</h1>
      <p class="meta">${escapeHtml(t("invoices.receipt.invoice"))} ${escapeHtml(invoice.invoiceNumber || t("invoices.receipt.notAvailable"))}</p>
      <table><tbody>
      <tr><th>${escapeHtml(t("invoices.receipt.client"))}</th><td>${escapeHtml(invoice.clientName || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${escapeHtml(t("invoices.receipt.invoiceTitle"))}</th><td>${escapeHtml(invoice.invoiceTitle || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${escapeHtml(t("invoices.receipt.paymentAmount"))}</th><td>$${Number(payment.amount || 0).toFixed(2)}</td></tr>
      <tr><th>${escapeHtml(t("invoices.receipt.method"))}</th><td>${escapeHtml(paymentMethodLabel(payment.method, t))}</td></tr>
      <tr><th>${escapeHtml(t("invoices.receipt.date"))}</th><td>${escapeHtml(payment.date || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${escapeHtml(t("invoices.receipt.reference"))}</th><td>${escapeHtml(payment.reference || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${escapeHtml(t("invoices.receipt.notes"))}</th><td>${escapeHtml(payment.notes || t("invoices.receipt.notAvailable"))}</td></tr>
      <tr><th>${escapeHtml(t("invoices.receipt.paidTotal"))}</th><td>$${Number(invoice.paidAmount || 0).toFixed(2)}</td></tr>
      <tr><th>${escapeHtml(t("invoices.receipt.balanceDue"))}</th><td>$${Number(invoice.balanceDue || 0).toFixed(2)}</td></tr>
      </tbody></table>`;
    openPrintableHtmlDocument({
      title: t("invoices.receipt.title"),
      bodyHtml,
    });
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

  const lastInvoiceFetchRef = useRef(0);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/invoices?limit=250&page=1");
      const payload = await getJsonOrThrow(res, t("invoices.errors.fetch"));
      setInvoices(Array.isArray(payload) ? payload : payload?.data || []);
      lastInvoiceFetchRef.current = Date.now();
    } catch (err) {
      setError(mapUiError(err, t("invoices.errors.load")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      setPaymentNotice(t("invoices.guide.paymentSuccess"));
      setPaymentNoticeTone("success");
      fetchInvoices();
      router.replace("/invoices", { scroll: false });
      return;
    }
    if (payment === "cancel") {
      setPaymentNotice(t("invoices.guide.paymentCancelled"));
      setPaymentNoticeTone("info");
      router.replace("/invoices", { scroll: false });
      return;
    }
    fetchInvoices();
  }, [searchParams, router, fetchInvoices, t]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastInvoiceFetchRef.current < 60_000) return;
      lastInvoiceFetchRef.current = now;
      fetchInvoices();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchInvoices]);

  useEffect(() => {
    const clientId = String(searchParams.get("clientId") || "").trim();
    if (!clientId) return;

    (async () => {
      try {
        const res = await apiFetch(`/api/clients/${clientId}`);
        const client = await getJsonOrThrow(res, t("invoices.errors.fetch"));
        if (!client?.name) return;
        setForm((prev) => ({
          ...prev,
          clientId,
          clientName: client.name || prev.clientName,
        }));
      } catch {
        // Optional prefill — ignore if client fetch fails
      }
    })();
  }, [searchParams, t]);

  const [paymentNoticeTone, setPaymentNoticeTone] = useState("success");

  const resetForm = () => {
    setForm(initialInvoice);
    setSelectedId(null);
    setQuoteLookup(null);
  };

  const saveInvoice = async () => {
    const clientErr = requireNonEmptyString(form.clientName, "Client");
    if (clientErr) {
      setError(clientErr);
      return;
    }
    if (!isPositiveMoney(form.amount)) {
      setError(t("invoices.errors.invalidAmount", { defaultValue: "Enter a valid invoice amount." }));
      return;
    }
    try {
      const method = selectedId ? "PATCH" : "POST";
      const url = selectedId ? `/api/invoices/${selectedId}` : "/api/invoices";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lineItems: normalizeInvoiceLineItemsForSave(form.lineItems),
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
      setError(mapUiError(err, t("invoices.errors.saveFallback")));
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
        lineItems: result.data.lineItems?.length
          ? normalizeInvoiceLineItemsForForm(result.data.lineItems)
          : current.lineItems,
        amount:
          result.data.amount ||
          (result.data.lineItems?.length
            ? String(sumInvoiceLineItemsTotals(result.data.lineItems))
            : current.amount),
        notes: result.data.notes || current.notes,
      }));
    } catch (err) {
      setError(mapUiError(err, t("invoices.errors.aiFallback")));
    } finally {
      setAiLoading(false);
    }
  };

  const editInvoice = (invoice) => {
    setForm({
      invoiceNumber: invoice.invoiceNumber || "",
      clientId: invoice.clientId || "",
      clientName: invoice.clientName || "",
      invoiceTitle: invoice.invoiceTitle || "",
      quoteNumber: invoice.quoteNumber || "",
      amount: invoice.amount || "",
      dueDate: invoice.dueDate || "",
      status: invoice.status || "Unpaid",
      preferredPaymentMethod: invoice.preferredPaymentMethod || "bank_transfer",
      lineItems: normalizeInvoiceLineItemsForForm(invoice.lineItems),
      notes: invoice.notes || "",
    });
    setSelectedId(invoice._id);
    setQuoteLookup(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteInvoice = async (id) => {
    try {
      const res = await apiFetch(`/api/invoices/${id}`, { method: "DELETE" });
      await getJsonOrThrow(res, t("invoices.errors.delete"));
      setInvoices(invoices.filter((invoice) => invoice._id !== id));
      if (selectedId === id) resetForm();
    } catch (err) {
      setError(mapUiError(err, t("invoices.errors.deleteFallback")));
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
      setError(
        mapUiError(err, t("invoices.errors.registerPaymentFallback")),
      );
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
      setError(mapUiError(err, t("invoices.errors.openCheckoutFallback")));
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
      setError(mapUiError(err, t("invoices.errors.sendInvoiceFallback")));
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

      let checkoutUrl = "";
      try {
        checkoutUrl = await getInvoiceCheckoutUrl(invoice);
      } catch {
        checkoutUrl = String(invoice.lastCheckoutUrl || "").trim();
      }

      let companyProfile = {};
      try {
        const profileRes = await apiFetch("/api/company-profile");
        if (profileRes.ok) {
          const profileJson = await profileRes.json();
          companyProfile = profileJson?.data || {};
        }
      } catch {
        companyProfile = {};
      }

      const { textLines } = buildInvoicePaymentInstructions({
        companyProfile,
        invoice,
        checkoutUrl,
      });
      const amount = Number(invoice.balanceDue || invoice.amount || 0).toFixed(
        2,
      );
      const smsBody = [
        t("invoices.messages.invoiceTextMessage", {
          invoice: invoice.invoiceNumber || t("invoices.labels.untitled"),
          amount,
          link: checkoutUrl || t("invoices.messages.invoiceTextNoLink"),
        }),
        "",
        ...textLines,
      ].join("\n");

      window.location.href = `sms:${recipientPhone}?body=${encodeURIComponent(smsBody)}`;
      window.alert(
        t("invoices.messages.invoiceTextOpened", { phone: recipientPhone }),
      );
    } catch (err) {
      setError(mapUiError(err, t("invoices.errors.sendInvoiceTextFallback")));
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

  const lookupEstimate = useCallback(async (rawValue) => {
    const q = String(rawValue || "").trim();
    if (!q) { setQuoteLookup(null); return; }
    setQuoteLookupLoading(true);
    setQuoteLookup(null);
    try {
      const res = await apiFetch(`/api/estimates/lookup?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        setQuoteLookup(json.data || null);
      }
    } catch {
      // silent — lookup is optional
    } finally {
      setQuoteLookupLoading(false);
    }
  }, []);

  const focusNewInvoiceForm = () => {
    resetForm();
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className={styles.page}>
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.headerTitle}>{t("invoices.title")}</h1>
          <p className={styles.headerSub}>{t("invoices.description")}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/invoices/summary" className={styles.btnGhost}>
            {t("sidebar.invoiceTotals", { defaultValue: "Invoice totals" })}
          </Link>
          {canEditInvoices ? (
            <button
              type="button"
              className={styles.btnPrimary}
              data-testid="invoices-new-button"
              onClick={focusNewInvoiceForm}
            >
              {t("invoices.buttons.newInvoice", { defaultValue: "+ New invoice" })}
            </button>
          ) : null}
        </div>
      </header>

      {!canEditInvoices ? (
        <p className={styles.muted} style={{ marginTop: 16 }}>
          {t("invoices.readOnlyHint", {
            defaultValue:
              "You can view invoices here. Ask an admin to grant write access to create or edit invoices.",
          })}
        </p>
      ) : null}

      {canManageInvoicePayments ? (
        <InvoiceClientPaymentsGuide
          variant="contractor"
          defaultExpanded={showClientPaymentsBanner}
        />
      ) : null}

      {paymentNotice ? (
        <div
          className={
            paymentNoticeTone === "success"
              ? styles.noticeSuccess
              : styles.noticeInfo
          }
        >
          {paymentNotice}
        </div>
      ) : null}

      {error && <div className={styles.error}>{error}</div>}
      {loading && <div className={styles.loading}>{t("invoices.loading")}</div>}

      {canEditInvoices
        ? <section
            ref={formSectionRef}
            className={styles.card}
            data-testid="invoices-form-section"
          >
            <h2 className={styles.cardTitle}>
              {selectedId
                ? t("invoices.formTitleEdit")
                : t("invoices.formTitleNew")}
            </h2>
            <div className={styles.formGrid}>
              <input
                placeholder={t("invoices.placeholders.invoiceNumber")}
                value={form.invoiceNumber}
                onChange={(e) =>
                  setForm({ ...form, invoiceNumber: e.target.value })
                }
                className={styles.field}
              />
              <ClientPickerField
                className={styles.clientPicker}
                variant="dark"
                clientId={form.clientId || ""}
                displayValue={form.clientName}
                showHint
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
              {form.clientName && !form.clientId ? (
                <p className={styles.clientLinkWarning} role="status">
                  {t("invoices.warnings.clientNotLinked", {
                    defaultValue:
                      "Pick the client from the search list (not only typing the name) so billing and job site addresses appear on the invoice.",
                  })}
                </p>
              ) : null}
              <input
                placeholder={t("invoices.placeholders.invoiceTitle")}
                value={form.invoiceTitle}
                onChange={(e) =>
                  setForm({ ...form, invoiceTitle: e.target.value })
                }
                className={styles.field}
              />
              <input
                placeholder="Estimate / Quote # (e.g. EST-0002 or #2)"
                value={form.quoteNumber}
                onChange={(e) =>
                  setForm({ ...form, quoteNumber: e.target.value })
                }
                onBlur={(e) => lookupEstimate(e.target.value)}
                className={styles.field}
              />
              {quoteLookupLoading && (
                <div className={styles.quoteSearching}>Searching estimates…</div>
              )}
              {quoteLookup && (
                <div className={styles.quoteLookup}>
                  <span>
                    <strong>{quoteLookup.estimateNumber}</strong> —{" "}
                    {quoteLookup.clientName || "Unknown client"}
                    {quoteLookup.total > 0 &&
                      ` · $${Number(quoteLookup.total).toFixed(2)}`}
                  </span>
                  {quoteLookup.clientName && !form.clientName && (
                    <button
                      type="button"
                      className={styles.quoteLookupBtn}
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          clientName: quoteLookup.clientName,
                          quoteNumber: quoteLookup.estimateNumber,
                        }));
                        setQuoteLookup(null);
                      }}
                    >
                      Use client
                    </button>
                  )}
                </div>
              )}
              <input
                placeholder={t("invoices.placeholders.amount")}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={styles.field}
              />
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className={styles.field}
              />
              <select
                value={form.preferredPaymentMethod}
                onChange={(e) =>
                  setForm({ ...form, preferredPaymentMethod: e.target.value })
                }
                className={styles.field}
              >
                {paymentMethodOptions(t).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <InvoiceLineItemsEditor
                lineItems={form.lineItems}
                onChange={handleLineItemsChange}
              />
              <textarea
                placeholder={t("invoices.placeholders.notes")}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={styles.fieldTextareaNotes}
              />
              <div className={styles.formActions}>
                <button
                  type="button"
                  onClick={runInvoiceAI}
                  disabled={aiLoading}
                  className={styles.btnAi}
                  style={{ cursor: aiLoading ? "wait" : "pointer" }}
                >
                  {aiLoading
                    ? t("invoices.buttons.aiLoading")
                    : t("invoices.buttons.ai")}
                </button>
                <button
                  type="button"
                  onClick={saveInvoice}
                  className={styles.btnPrimary}
                >
                  {selectedId
                    ? t("invoices.buttons.update")
                    : t("invoices.buttons.save")}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className={styles.btnGhost}
                >
                  {t("invoices.buttons.clear")}
                </button>
              </div>
            </div>
          </section>
        : null}

      <section className={styles.listSection}>
        <h2 className={styles.listTitle}>{t("invoices.listTitle")}</h2>
        <input
          type="search"
          value={listSearch}
          onChange={(event) => setListSearch(event.target.value)}
          placeholder={t("invoices.searchPlaceholder", {
            defaultValue: "Search by invoice #, client, title, or status…",
          })}
          aria-label={t("invoices.searchLabel", { defaultValue: "Search invoices" })}
          className={styles.listSearch}
        />
        {filterClientId ? (
          <p className={styles.muted} style={{ marginBottom: 12 }}>
            {t("invoices.filteredByClient", {
              defaultValue: "Showing invoices for the selected client only.",
            })}{" "}
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => router.push("/invoices")}
            >
              {t("invoices.clearClientFilter", { defaultValue: "Show all" })}
            </button>
          </p>
        ) : null}
        <div className={styles.listGrid}>
          {visibleInvoices.length === 0 && !loading ? (
            <p className={styles.muted}>
              {listSearch.trim()
                ? t("invoices.noSearchResults", {
                    defaultValue: "No invoices match your search.",
                  })
                : t("invoices.empty", { defaultValue: "No invoices yet. Create one above." })}
            </p>
          ) : null}
          {visibleInvoices.map((invoice) => (
            <div key={invoice._id} data-testid="invoice-card" className={styles.invoiceCard}>
              <div className={styles.invoiceCardHeader}>
                <div>
                  <h3 className={styles.invoiceTitle}>
                    {invoice.invoiceNumber || t("invoices.labels.untitled")}
                  </h3>
                  <p className={styles.muted}>
                    {invoice.clientName} |{" "}
                    {t(`invoices.statusOptions.${invoice.status}`) ||
                      invoice.status}
                  </p>
                  {invoice.invoiceTitle
                    ? <p className={styles.muted}>{invoice.invoiceTitle}</p>
                    : null}
                  {invoice.clientAddress
                    ? <p className={styles.muted}>
                        {t("invoices.party.customerAddress", {
                          defaultValue: "Customer",
                        })}
                        : {invoice.clientAddress}
                      </p>
                    : null}
                  {invoice.propertyAddress
                    ? <p className={styles.muted}>
                        {t("invoices.party.propertyAddress", {
                          defaultValue: "Job site",
                        })}
                        : {invoice.propertyAddress}
                      </p>
                    : null}
                  {invoice.clientPhone
                    ? <p className={styles.muted}>
                        {t("invoices.party.phone", { defaultValue: "Phone" })}:{" "}
                        {invoice.clientPhone}
                      </p>
                    : null}
                  {invoice.quoteNumber
                    ? <p className={styles.muted}>
                        Quote ID: {invoice.quoteNumber}
                      </p>
                    : null}
                  <p className={styles.muted}>
                    {t("invoices.labels.amount")}: ${invoice.amount}
                  </p>
                  <p className={styles.muted}>
                    {t("invoices.labels.paid")}: $
                    {Number(invoice.paidAmount || 0).toFixed(2)} |
                    {t("invoices.labels.balance")}: $
                    {Number(invoice.balanceDue || invoice.amount || 0).toFixed(
                      2,
                    )}
                  </p>
                  <p className={styles.muted}>
                    {t("invoices.labels.preferredMethod")}:{" "}
                    {paymentMethodLabel(invoice.preferredPaymentMethod, t)}
                  </p>
                  <p className={styles.muted}>
                    {t("invoices.labels.dueDate")}:{" "}
                    {invoice.dueDate || t("invoices.labels.noDate")}
                  </p>
                  {hasDisplayableInvoiceLineItems(invoice.lineItems)
                    ? <p className={styles.mutedPre}>
                        {formatInvoiceLineItemsForList(invoice.lineItems)}
                      </p>
                    : null}
                  {invoice.payments?.length
                    ? <p className={styles.paymentsPre}>
                        {invoice.payments
                          .map(
                            (item) =>
                              `- ${item.date}: $${Number(item.amount || 0).toFixed(2)} (${paymentMethodLabel(item.method, t)})${item.reference ? ` ${t("invoices.labels.paymentRefPrefix")} ${item.reference}` : ""}`,
                          )
                          .join("\n")}
                      </p>
                    : null}
                </div>
                <div className={styles.actions}>
                  <DocumentPdfActions
                    pdfUrl={`/api/invoices/${invoice._id}/pdf`}
                    printLabel={t("invoices.buttons.printInvoice", {
                      defaultValue: "Print invoice",
                    })}
                    downloadLabel={t("invoices.buttons.downloadPdf", {
                      defaultValue: "Download PDF",
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => void openPrintableInvoice(invoice)}
                    className={styles.btnIcon}
                    aria-label={t("invoices.buttons.printBrowser", {
                      defaultValue: "Print in browser",
                    })}
                  >
                    {t("invoices.buttons.printBrowser", {
                      defaultValue: "Print (browser)",
                    })}
                  </button>
                  {capabilities.canSendExternalCommunications
                    ? <button
                        type="button"
                        onClick={() => sendInvoiceEmail(invoice)}
                        className={styles.btnTeal}
                      >
                        {t("invoices.buttons.sendInvoiceEmail")}
                      </button>
                    : null}
                  {capabilities.canSendExternalCommunications
                    ? <button
                        type="button"
                        onClick={() => sendInvoiceText(invoice)}
                        className={styles.btnBlue}
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
                  {canManageInvoicePayments &&
                    stripePublishableConfigured
                    ? <button
                        type="button"
                        onClick={() => payOnline(invoice)}
                        className={styles.btnStripe}
                      >
                        {t("invoices.buttons.chargeOnline")}
                      </button>
                    : null}
                  {canManageInvoicePayments
                    ? <button
                        type="button"
                        onClick={() => startRegisterPayment(invoice)}
                        className={styles.btnGreen}
                      >
                        {t("invoices.buttons.registerPayment")}
                      </button>
                    : null}
                  {canEditInvoices
                    ? <button
                        type="button"
                        onClick={() => editInvoice(invoice)}
                        className={styles.btnIcon}
                      >
                        <IconPencil />
                        {t("invoices.buttons.edit")}
                      </button>
                    : null}
                  {capabilities.canDeleteRecords
                    ? <button
                        type="button"
                        onClick={() => deleteInvoice(invoice._id)}
                        className={styles.btnIconDanger}
                      >
                        <IconTrash />
                        {t("invoices.buttons.delete")}
                      </button>
                    : null}
                </div>
              </div>
              {openPaymentFormId === invoice._id
                ? <div className={styles.paymentPanel}>
                    <strong>{t("invoices.labels.paymentFormTitle")}</strong>
                    <div className={styles.paymentGrid}>
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
                        className={styles.fieldCompact}
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
                        className={styles.fieldCompact}
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
                        className={styles.fieldCompact}
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
                        className={styles.fieldCompact}
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
                      className={styles.fieldCompactTall}
                    />
                    <div className={styles.formActions}>
                      <button
                        type="button"
                        onClick={() => registerPayment(invoice)}
                        disabled={savingPaymentId === invoice._id}
                        className={styles.btnGreen}
                      >
                        {savingPaymentId === invoice._id
                          ? t("invoices.buttons.savingPayment")
                          : t("invoices.buttons.savePayment")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenPaymentFormId("")}
                        className={styles.btnGhost}
                      >
                        {t("invoices.buttons.cancel")}
                      </button>
                    </div>
                  </div>
                : null}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
