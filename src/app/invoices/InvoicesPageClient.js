"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import InvoiceBuilder from "@/components/invoices/InvoiceBuilder";
import InvoiceClientPaymentsGuide from "@/components/invoices/InvoiceClientPaymentsGuide";
import InvoiceListCard from "@/components/invoices/InvoiceListCard";
import styles from "./invoices.module.css";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import {
  escapeHtml,
  openPrintableHtmlDocument,
} from "@/lib/print-html-document";
import { filterAndRankRecords } from "@/lib/record-search";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  getClientsListMeta,
  normalizeClientsListPayload,
} from "@/lib/clients-list-response";
import {
  computeInvoiceLineItemTotal,
  createInvoiceLineItem,
  getInvoiceLineItemDescription,
  normalizeInvoiceLineItemsForForm,
  normalizeInvoiceLineItemsForSave,
  sumInvoiceLineItemsTotals,
} from "@/lib/invoice-line-items";
import {
  COMPUTED_INVOICE_STATUSES,
  normalizeMoney,
  resolveInvoiceStatus,
} from "@/lib/invoice-payments";
import { buildFieldBasePoweredByHtml } from "@/lib/fieldbase-document-branding";
import { buildInvoicePartyHtmlBlock } from "@/lib/invoice-party";
import { buildInvoicePaymentInstructions } from "@/lib/invoice-client-payment-instructions";
import { isPositiveMoney, requireNonEmptyString } from "@/lib/field-validation";
import "@/i18n";

const INVOICES_UI_PAGE_SIZE = 50;

const todayIso = () => new Date().toISOString().slice(0, 10);

const initialInvoice = {
  invoiceNumber: "",
  clientId: "",
  clientName: "",
  invoiceTitle: "",
  quoteNumber: "",
  amount: "",
  invoiceDate: todayIso(),
  dueDate: "",
  status: "Draft",
  preferredPaymentMethod: "cash",
  lineItems: [createInvoiceLineItem("line-1")],
  notes: "",
  internalNotes: "",
};

const PAYMENT_METHOD_VALUES = [
  "cash",
  "check",
  "credit_card",
  "bank_transfer",
  "zelle",
  "venmo",
  "paypal",
  "other",
];

const INVOICE_STATUS_VALUES = [
  "Draft",
  "Sent",
  "Viewed",
  "Partial",
  "Paid",
  "Overdue",
  "Cancelled",
];

const invoiceStatusOptions = (t) =>
  INVOICE_STATUS_VALUES.map((value) => ({
    value,
    label:
      t(`invoices.statusOptions.${value}`) ||
      t(`invoices.statusOptions.${value === "Partial" ? "PartiallyPaid" : value}`) ||
      value,
  }));

const formatUsd = (value) => `$${Number(value || 0).toFixed(2)}`;

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

const initialPaymentDraft = (invoice) => ({
  amount: String(invoice.balanceDue || invoice.amount || ""),
  method: invoice.preferredPaymentMethod || "bank_transfer",
  date: todayIso(),
  reference: "",
  notes: "",
});


export default function InvoicesPageClient({ initialList = null }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { capabilities } = useCurrentUserAccess();
  const stripePublishableConfigured = Boolean(
    String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim(),
  );
  const [invoices, setInvoices] = useState(initialList?.data ?? []);
  const [form, setForm] = useState(initialInvoice);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(!initialList);
  const [listPage, setListPage] = useState(initialList?.page ?? 1);
  const [listTotal, setListTotal] = useState(initialList?.total ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
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
  const debouncedListSearch = useDebouncedValue(listSearch.trim(), 300);
  const [view, setView] = useState("list");
  const [autoSaveLabel, setAutoSaveLabel] = useState("");
  const savedSnapshotRef = useRef(JSON.stringify(initialInvoice));
  const autoSavingRef = useRef(false);

  const filterClientId = String(searchParams.get("clientId") || "").trim();
  const canEditInvoices = capabilities.canManageSensitiveData;
  const canManageInvoicePayments = capabilities.canManageSensitiveData;
  const builderOpen = view === "builder" && canEditInvoices;

  const isDirty = useMemo(
    () => JSON.stringify(form) !== savedSnapshotRef.current,
    [form],
  );

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice._id === selectedId) || null,
    [invoices, selectedId],
  );

  const formTotals = useMemo(() => {
    const lineSubtotal = sumInvoiceLineItemsTotals(form.lineItems);
    const total = normalizeMoney(form.amount) || lineSubtotal;
    const tax = 0;
    const paid = Number(selectedInvoice?.paidAmount || 0);
    const balance = Math.max(0, Number((total - paid).toFixed(2)));
    return {
      subtotal: lineSubtotal > 0 ? lineSubtotal : total,
      tax,
      total,
      paid,
      balance,
    };
  }, [form.amount, form.lineItems, selectedInvoice]);

  const effectiveStatus = useMemo(
    () =>
      resolveInvoiceStatus(
        {
          ...form,
          payments: selectedInvoice?.payments || [],
        },
        { requestedStatus: form.status },
      ),
    [form, selectedInvoice],
  );

  const statusIsComputed = COMPUTED_INVOICE_STATUSES.has(effectiveStatus);

  const visibleInvoices = useMemo(() => {
    let list = invoices;
    if (filterClientId) {
      list = list.filter(
        (invoice) => String(invoice.clientId || "") === filterClientId,
      );
    }
    if (listSearch.trim() && debouncedListSearch.length < 2) {
      list = filterAndRankRecords(list, listSearch, (invoice) => [
        invoice.invoiceNumber,
        invoice.clientName,
        invoice.invoiceTitle,
        invoice.quoteNumber,
        invoice.status,
      ]);
    }
    return list;
  }, [debouncedListSearch.length, invoices, filterClientId, listSearch]);

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
      ${printableInvoice.notes ? `<p><strong>${escapeHtml(t("invoices.labels.workPerformed", { defaultValue: "Work Performed" }))}</strong><br/>${escapeHtml(printableInvoice.notes)}</p>` : ""}
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

  const fetchInvoices = useCallback(async ({ page = 1, append = false, force = false, search = "" } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const params = new URLSearchParams({
        limit: String(INVOICES_UI_PAGE_SIZE),
        page: String(page),
      });
      if (search) params.set("search", search);
      const res = await apiFetch(`/api/invoices?${params.toString()}`);
      const payload = await getJsonOrThrow(res, t("invoices.errors.fetch"));
      const batch = normalizeClientsListPayload(payload);
      const meta = getClientsListMeta(payload, batch.length);
      setListPage(meta.page);
      setListTotal(meta.total);
      setInvoices((prev) => (append ? [...prev, ...batch] : batch));
      if (force || !append) {
        lastInvoiceFetchRef.current = Date.now();
      }
    } catch (err) {
      setError(mapUiError(err, t("invoices.errors.load")));
      if (!append) setInvoices([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  const loadMoreInvoices = useCallback(() => {
    if (loading || loadingMore || invoices.length >= listTotal) return;
    fetchInvoices({
      page: listPage + 1,
      append: true,
      search: debouncedListSearch.length >= 2 ? debouncedListSearch : "",
    });
  }, [
    debouncedListSearch,
    fetchInvoices,
    invoices.length,
    listPage,
    listTotal,
    loading,
    loadingMore,
  ]);

  useEffect(() => {
    if (initialList && debouncedListSearch.length < 2) return;
    fetchInvoices({
      page: 1,
      append: false,
      search: debouncedListSearch.length >= 2 ? debouncedListSearch : "",
    });
  }, [debouncedListSearch, fetchInvoices, initialList]);

  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      setPaymentNotice(t("invoices.guide.paymentSuccess"));
      setPaymentNoticeTone("success");
      fetchInvoices({ force: true });
      router.replace("/invoices", { scroll: false });
      return;
    }
    if (payment === "cancel") {
      setPaymentNotice(t("invoices.guide.paymentCancelled"));
      setPaymentNoticeTone("info");
      router.replace("/invoices", { scroll: false });
    }
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
    const next = { ...initialInvoice, invoiceDate: todayIso() };
    setForm(next);
    setSelectedId(null);
    setQuoteLookup(null);
    savedSnapshotRef.current = JSON.stringify(next);
    setAutoSaveLabel("");
  };

  const closeBuilder = () => {
    if (isDirty) {
      const leave = window.confirm(
        t("invoices.builder.leaveConfirm", {
          defaultValue:
            "You have unsaved changes. Leave without saving?",
        }),
      );
      if (!leave) return;
    }
    resetForm();
    setView("list");
  };

  const openNewInvoice = () => {
    resetForm();
    setView("builder");
  };

  const persistInvoice = async ({ asDraft = true } = {}) => {
    const clientErr = requireNonEmptyString(form.clientName, "Client");
    if (clientErr) {
      setError(clientErr);
      return null;
    }
    const lineTotal = sumInvoiceLineItemsTotals(form.lineItems);
    if (!isPositiveMoney(form.amount) && lineTotal <= 0) {
      setError(
        t("invoices.errors.invalidAmount", {
          defaultValue: "Add at least one line item with an amount.",
        }),
      );
      return null;
    }

    const payload = {
      ...form,
      amount: form.amount || String(lineTotal),
      lineItems: normalizeInvoiceLineItemsForSave(form.lineItems),
      status: asDraft
        ? "Draft"
        : form.status === "Draft"
          ? "Sent"
          : form.status,
    };

    const method = selectedId ? "PATCH" : "POST";
    const url = selectedId ? `/api/invoices/${selectedId}` : "/api/invoices";
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await getJsonOrThrow(res, t("invoices.errors.save"));
    return result.data;
  };

  const applySavedInvoice = (saved) => {
    setInvoices(
      selectedId
        ? invoices.map((invoice) =>
            invoice._id === selectedId ? saved : invoice,
          )
        : [saved, ...invoices.filter((item) => item._id !== saved._id)],
    );
    setSelectedId(saved._id);
    savedSnapshotRef.current = JSON.stringify(form);
  };

  const saveDraft = async ({ silent = false } = {}) => {
    if (autoSavingRef.current) return null;
    if (!silent) setSaving(true);
    autoSavingRef.current = true;
    setError("");
    try {
      const saved = await persistInvoice({ asDraft: true });
      if (!saved) return null;
      applySavedInvoice(saved);
      if (silent) {
        setAutoSaveLabel(
          t("invoices.builder.autoSaved", { defaultValue: "Draft saved" }),
        );
      }
      return saved;
    } catch (err) {
      if (!silent) {
        setError(mapUiError(err, t("invoices.errors.saveFallback")));
      }
      return null;
    } finally {
      autoSavingRef.current = false;
      if (!silent) setSaving(false);
    }
  };

  const previewInvoice = async () => {
    setError("");
    try {
      let id = selectedId;
      if (!id) {
        const saved = await saveDraft({ silent: true });
        id = saved?._id;
      }
      if (!id) return;
      window.open(`/api/invoices/${id}/pdf`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(mapUiError(err, t("invoices.errors.saveFallback")));
    }
  };

  const sendInvoiceFromForm = async () => {
    setSending(true);
    setError("");
    try {
      const saved = await persistInvoice({ asDraft: true });
      if (!saved) return;
      applySavedInvoice(saved);
      const recipientEmail = String(
        saved.clientEmail || form.clientEmail || "",
      )
        .trim()
        .toLowerCase();
      const res = await apiFetch(`/api/invoices/${saved._id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipientEmail ? { recipientEmail } : {}),
      });
      await getJsonOrThrow(res, t("invoices.errors.sendInvoice"));
      resetForm();
      setView("list");
    } catch (err) {
      setError(mapUiError(err, t("invoices.errors.sendInvoiceFallback")));
    } finally {
      setSending(false);
    }
  };

  const runInvoiceAI = async () => {
    setAiLoading(true);
    setError("");

    try {
      const res = await apiFetch("/api/ai/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          language: i18n.language,
        }),
      });
      const result = await getJsonOrThrow(res, t("invoices.errors.ai"));
      if (result.data?.notes) {
        setForm((current) => ({
          ...current,
          notes: result.data.notes,
        }));
      }
    } catch (err) {
      setError(mapUiError(err, t("invoices.errors.aiFallback")));
    } finally {
      setAiLoading(false);
    }
  };

  const editInvoice = (invoice) => {
    const nextForm = {
      invoiceNumber: invoice.invoiceNumber || "",
      clientId: invoice.clientId || "",
      clientName: invoice.clientName || "",
      clientEmail: invoice.clientEmail || "",
      invoiceTitle: invoice.invoiceTitle || "",
      quoteNumber: invoice.quoteNumber || "",
      amount: invoice.amount || "",
      invoiceDate: invoice.createdAt
        ? String(invoice.createdAt).slice(0, 10)
        : todayIso(),
      dueDate: invoice.dueDate || "",
      status: invoice.status || "Sent",
      preferredPaymentMethod: invoice.preferredPaymentMethod || "bank_transfer",
      lineItems: normalizeInvoiceLineItemsForForm(invoice.lineItems),
      notes: invoice.notes || "",
      internalNotes: invoice.internalNotes || "",
    };
    setForm(nextForm);
    setSelectedId(invoice._id);
    setQuoteLookup(null);
    savedSnapshotRef.current = JSON.stringify(nextForm);
    setView("builder");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const duplicateInvoice = (invoice) => {
    const nextForm = {
      ...initialInvoice,
      invoiceDate: todayIso(),
      clientId: invoice.clientId || "",
      clientName: invoice.clientName || "",
      clientEmail: invoice.clientEmail || "",
      invoiceTitle: invoice.invoiceTitle
        ? `${invoice.invoiceTitle} (copy)`
        : "",
      quoteNumber: invoice.quoteNumber || "",
      amount: invoice.amount || "",
      dueDate: invoice.dueDate || "",
      preferredPaymentMethod: invoice.preferredPaymentMethod || "bank_transfer",
      lineItems: normalizeInvoiceLineItemsForForm(invoice.lineItems),
      notes: invoice.notes || "",
      internalNotes: invoice.internalNotes || "",
      status: "Draft",
    };
    setForm(nextForm);
    setSelectedId(null);
    savedSnapshotRef.current = JSON.stringify(nextForm);
    setView("builder");
  };

  const viewInvoice = (invoice) => {
    window.open(`/api/invoices/${invoice._id}/pdf`, "_blank", "noopener,noreferrer");
  };

  const deleteInvoice = async (id) => {
    try {
      const res = await apiFetch(`/api/invoices/${id}`, { method: "DELETE" });
      await getJsonOrThrow(res, t("invoices.errors.delete"));
      setInvoices(invoices.filter((invoice) => invoice._id !== id));
      if (selectedId === id) {
        resetForm();
        setView("list");
      }
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

  useEffect(() => {
    if (!builderOpen || !isDirty) return undefined;
    const timer = window.setTimeout(() => {
      const lineTotal = sumInvoiceLineItemsTotals(form.lineItems);
      if (!String(form.clientName || "").trim()) return;
      if (!isPositiveMoney(form.amount) && lineTotal <= 0) return;
      void saveDraft({ silent: true });
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [builderOpen, form, isDirty]);

  useEffect(() => {
    if (!builderOpen || !isDirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [builderOpen, isDirty]);

  useEffect(() => {
    if (!builderOpen) return undefined;
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDraft();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void sendInvoiceFromForm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [builderOpen, form, selectedId, invoices]);

  return (
    <main className={`${styles.page}${builderOpen ? ` ${styles.pageBuilder}` : ""}`}>
      {builderOpen ? (
        <InvoiceBuilder
          form={form}
          setForm={setForm}
          formTotals={formTotals}
          selectedId={selectedId}
          selectedInvoice={selectedInvoice}
          effectiveStatus={effectiveStatus}
          statusIsComputed={statusIsComputed}
          invoiceStatusOptions={invoiceStatusOptions(t).filter(
            (option) =>
              statusIsComputed ||
              !COMPUTED_INVOICE_STATUSES.has(option.value),
          )}
          paymentMethodOptions={paymentMethodOptions(t)}
          onLineItemsChange={handleLineItemsChange}
          onSaveDraft={() => saveDraft()}
          onPreview={() => void previewInvoice()}
          onSendInvoice={() => void sendInvoiceFromForm()}
          onBack={closeBuilder}
          onRunAi={runInvoiceAI}
          aiLoading={aiLoading}
          saving={saving}
          sending={sending}
          autoSaveLabel={autoSaveLabel}
          isDirty={isDirty}
        />
      ) : null}

      {!builderOpen ? (
        <>
          <header className={styles.headerRow}>
            <div>
              <h1 className={styles.headerTitle}>{t("invoices.title")}</h1>
              <p className={styles.headerSub}>
                {t("invoices.composer.subtitle", {
                  defaultValue: "Create and send an invoice in under a minute.",
                })}
              </p>
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
                  onClick={openNewInvoice}
                >
                  {t("invoices.buttons.newInvoice", {
                    defaultValue: "+ New invoice",
                  })}
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
          {loading && (
            <div className={styles.loading}>{t("invoices.loading")}</div>
          )}

          <section className={styles.listSection}>
            <h2 className={styles.listTitle}>{t("invoices.listTitle")}</h2>
            <input
              type="search"
              value={listSearch}
              onChange={(event) => setListSearch(event.target.value)}
              placeholder={t("invoices.searchPlaceholder", {
                defaultValue: "Search by invoice #, client, title, or status…",
              })}
              aria-label={t("invoices.searchLabel", {
                defaultValue: "Search invoices",
              })}
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
            {listTotal > invoices.length &&
            !listSearch.trim() &&
            !filterClientId ? (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={loadMoreInvoices}
                disabled={loadingMore}
                data-testid="invoices-load-more"
              >
                {loadingMore
                  ? t("invoices.loading")
                  : t("invoices.loadMore", { defaultValue: "Load more" })}
              </button>
            ) : null}
            <div className={styles.listGrid}>
              {visibleInvoices.length === 0 && !loading ? (
                <p className={styles.muted}>
                  {listSearch.trim()
                    ? t("invoices.noSearchResults", {
                        defaultValue: "No invoices match your search.",
                      })
                    : t("invoices.empty", {
                        defaultValue: "No invoices yet. Create one above.",
                      })}
                </p>
              ) : null}
              {visibleInvoices.map((invoice) => (
                <InvoiceListCard
                  key={invoice._id}
                  invoice={invoice}
                  canEdit={canEditInvoices}
                  canDelete={capabilities.canDeleteRecords}
                  canManagePayments={canManageInvoicePayments}
                  canSendExternal={capabilities.canSendExternalCommunications}
                  stripeConfigured={stripePublishableConfigured}
                  statusLabel={
                    t(`invoices.statusOptions.${invoice.status}`) ||
                    invoice.status
                  }
                  amountLabel={formatUsd(invoice.amount)}
                  dueLabel={
                    invoice.dueDate
                      ? invoice.dueDate
                      : t("invoices.labels.noDate")
                  }
                  onView={() => viewInvoice(invoice)}
                  onEdit={() => editInvoice(invoice)}
                  onDuplicate={() => duplicateInvoice(invoice)}
                  onDownloadPdf={() => {
                    window.open(
                      `/api/invoices/${invoice._id}/pdf`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                  onPrint={() => void openPrintableInvoice(invoice)}
                  onSendEmail={() => sendInvoiceEmail(invoice)}
                  onSendText={() => sendInvoiceText(invoice)}
                  onShare={() => resolveInvoiceShareData(invoice)}
                  onChargeOnline={() => payOnline(invoice)}
                  onRegisterPayment={() => startRegisterPayment(invoice)}
                  onDelete={() => {
                    if (
                      window.confirm(
                        t("invoices.confirmDelete", {
                          defaultValue: "Delete this invoice?",
                        }),
                      )
                    ) {
                      void deleteInvoice(invoice._id);
                    }
                  }}
                />
              ))}
            </div>
          </section>
        </>
      ) : null}

      {error && builderOpen ? (
        <div className={styles.builderErrorToast}>{error}</div>
      ) : null}

      {openPaymentFormId ? (
        <div className={styles.paymentModalBackdrop} data-testid="invoice-payment-modal">
          <div className={styles.paymentModal}>
            {(() => {
              const invoice = invoices.find(
                (item) => item._id === openPaymentFormId,
              );
              if (!invoice) return null;
              return (
                <>
                  <h3 className={styles.paymentModalTitle}>
                    {t("invoices.labels.paymentFormTitle")}
                  </h3>
                  <p className={styles.paymentModalMeta}>
                    {invoice.invoiceNumber} · {invoice.clientName}
                  </p>
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
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </main>
  );
}
