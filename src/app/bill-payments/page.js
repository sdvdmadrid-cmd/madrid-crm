"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const initialBillForm = {
  providerId: "",
  providerName: "",
  accountLabel: "",
  accountNumber: "",
  amountDue: "",
  minimumAmount: "",
  dueDate: "",
  tags: "",
  notes: "",
};

const initialAutopayDraft = {
  enabled: false,
  paused: false,
  paymentMethodId: "",
  ruleType: "full_balance",
  fixedAmount: "",
  scheduleType: "due_date",
  daysBeforeDue: "3",
  monthlyDay: "1",
  notifyDaysBefore: "3",
};

function formatCurrency(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "USD").toUpperCase(),
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function buildAutopayDraft(bill) {
  const rule = bill.autopayRule;
  if (!rule) return { ...initialAutopayDraft };
  return {
    enabled: rule.enabled === true,
    paused: rule.paused === true,
    paymentMethodId: rule.paymentMethodId || "",
    ruleType: rule.ruleType || "full_balance",
    fixedAmount: rule.fixedAmount == null ? "" : String(rule.fixedAmount),
    scheduleType: rule.scheduleType || "due_date",
    daysBeforeDue:
      rule.daysBeforeDue == null ? "3" : String(rule.daysBeforeDue),
    monthlyDay: rule.monthlyDay == null ? "1" : String(rule.monthlyDay),
    notifyDaysBefore: String(rule.notifyDaysBefore ?? 3),
  };
}

function PaymentMethodSetupForm({
  methodType,
  onCancel,
  onSaved,
  onError,
  saving,
  setSaving,
}) {
  const stripe = useStripe();
  const elements = useElements();

  const submit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true);
    onError("");

    const result = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url:
          typeof window !== "undefined" ? window.location.href : undefined,
      },
    });

    if (result.error) {
      onError(result.error.message || "Unable to save payment method.");
      setSaving(false);
      return;
    }

    const paymentMethodId = result.setupIntent?.payment_method;
    if (typeof paymentMethodId !== "string") {
      onError("Stripe did not return a payment method.");
      setSaving(false);
      return;
    }

    try {
      const syncResponse = await apiFetch(
        "/api/bill-payments/payment-methods/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId, setDefault: false }),
        },
      );
      const payload = await getJsonOrThrow(
        syncResponse,
        "Unable to sync saved payment method.",
      );
      onSaved(payload.data);
    } catch (error) {
      onError(error.message || "Unable to sync saved payment method.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          padding: 14,
          borderRadius: 16,
          border: "1px solid rgba(15, 23, 42, 0.12)",
          background: "rgba(255,255,255,0.9)",
        }}
      >
        <PaymentElement
          options={{
            layout: { type: "tabs", defaultCollapsed: false },
            fields: { billingDetails: "never" },
            wallets: { applePay: "never", googlePay: "never" },
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={!stripe || !elements || saving}
          style={{
            border: 0,
            borderRadius: 999,
            background: "#0f766e",
            color: "#fff",
            padding: "12px 18px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {saving
            ? "Saving method..."
            : methodType === "bank_account"
              ? "Save ACH account"
              : "Save card or debit"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            borderRadius: 999,
            border: "1px solid rgba(15, 23, 42, 0.14)",
            background: "#fff",
            color: "#0f172a",
            padding: "12px 18px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function loadPlaidScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Plaid is only available in the browser"));
  }

  if (window.Plaid) {
    return Promise.resolve(window.Plaid);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-plaid-link="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Plaid), {
        once: true,
      });
      existing.addEventListener(
        "error",
        () => reject(new Error("Unable to load Plaid Link")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.plaidLink = "true";
    script.onload = () => resolve(window.Plaid);
    script.onerror = () => reject(new Error("Unable to load Plaid Link"));
    document.head.appendChild(script);
  });
}

export default function BillPaymentsPage() {
  const { capabilities } = useCurrentUserAccess();
  const [loading, setLoading] = useState(true);
  const [savingBill, setSavingBill] = useState(false);
  const [paying, setPaying] = useState(false);
  const [autopaySavingId, setAutopaySavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [providers, setProviders] = useState([]);
  const [dashboard, setDashboard] = useState({
    bills: [],
    autopayRules: [],
    recentTransactions: [],
  });
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [billForm, setBillForm] = useState(initialBillForm);
  const [editingBillId, setEditingBillId] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedBillIds, setSelectedBillIds] = useState([]);
  const [activeAutopayBillId, setActiveAutopayBillId] = useState("");
  const [autopayDrafts, setAutopayDrafts] = useState({});
  const [setupIntentState, setSetupIntentState] = useState({
    active: false,
    clientSecret: "",
    methodType: "card",
  });
  const [savingMethod, setSavingMethod] = useState(false);
  const [plaidLaunching, setPlaidLaunching] = useState(false);
  const deferredProviderQuery = useDeferredValue(providerQuery);
  const deferredFilterQuery = useDeferredValue(filterQuery);

  const canManageSensitiveData = capabilities.canManageSensitiveData;
  const bills = dashboard.bills || [];
  const recentTransactions = dashboard.recentTransactions || [];
  const executablePaymentMethods = useMemo(
    () => paymentMethods.filter((method) => method.provider !== "plaid"),
    [paymentMethods],
  );

  const stats = useMemo(() => {
    const openBills = bills.filter(
      (bill) => bill.status === "open" || bill.status === "overdue",
    );
    const scheduledAutopay = bills.filter((bill) => bill.autopayEnabled).length;
    const totalDue = openBills.reduce(
      (sum, bill) => sum + Number(bill.amountDue || 0),
      0,
    );
    return {
      openCount: openBills.length,
      scheduledAutopay,
      totalDue,
      recentPayments: recentTransactions.filter((tx) => tx.status === "paid")
        .length,
    };
  }, [bills, recentTransactions]);

  const knownTags = useMemo(() => {
    const tags = new Set();
    for (const bill of bills) {
      for (const tag of bill.tags || []) {
        if (tag) tags.add(tag);
      }
    }
    return [...tags].sort();
  }, [bills]);

  const filteredBills = useMemo(() => {
    const query = deferredFilterQuery.trim().toLowerCase();
    return bills.filter((bill) => {
      if (statusFilter !== "all" && bill.status !== statusFilter) return false;
      if (tagFilter !== "all" && !(bill.tags || []).includes(tagFilter))
        return false;
      if (!query) return true;
      return [
        bill.providerName,
        bill.accountLabel,
        bill.accountReferenceMasked,
        ...(bill.tags || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [bills, deferredFilterQuery, statusFilter, tagFilter]);

  const loadProviders = useCallback(async (query = "") => {
    try {
      const response = await apiFetch(
        `/api/bill-payments/providers${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      );
      const payload = await getJsonOrThrow(
        response,
        "Unable to load provider catalog.",
      );
      setProviders(payload.data || []);
    } catch (providerError) {
      setError(providerError.message || "Unable to load provider catalog.");
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [billsResponse, methodsResponse] = await Promise.all([
        apiFetch("/api/bill-payments/bills"),
        apiFetch("/api/bill-payments/payment-methods"),
      ]);
      const billsPayload = await getJsonOrThrow(
        billsResponse,
        "Unable to load Bill Payments.",
      );
      const methodsPayload = await getJsonOrThrow(
        methodsResponse,
        "Unable to load saved payment methods.",
      );
      setDashboard(
        billsPayload.data || {
          bills: [],
          autopayRules: [],
          recentTransactions: [],
        },
      );
      setPaymentMethods(methodsPayload.data || []);
      const nextDrafts = {};
      for (const bill of billsPayload.data?.bills || []) {
        nextDrafts[bill.id] = buildAutopayDraft(bill);
      }
      setAutopayDrafts(nextDrafts);
    } catch (loadError) {
      setError(loadError.message || "Unable to load Bill Payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadProviders();
  }, [loadDashboard, loadProviders]);

  useEffect(() => {
    if (deferredProviderQuery.trim().length < 2) {
      loadProviders();
      return;
    }
    loadProviders(deferredProviderQuery.trim());
  }, [deferredProviderQuery, loadProviders]);

  const selectedPaymentMethodId = useMemo(() => {
    const defaultMethod = executablePaymentMethods.find(
      (method) => method.isDefault,
    );
    return defaultMethod?.id || executablePaymentMethods[0]?.id || "";
  }, [executablePaymentMethods]);

  function resetBillForm() {
    setBillForm(initialBillForm);
    setEditingBillId("");
    setProviderQuery("");
  }

  function selectBillForEdit(bill) {
    setEditingBillId(bill.id);
    setBillForm({
      providerId: bill.providerId || "",
      providerName: bill.providerName || "",
      accountLabel: bill.accountLabel || "",
      accountNumber: "",
      amountDue: String(bill.amountDue || ""),
      minimumAmount:
        bill.minimumAmount == null ? "" : String(bill.minimumAmount),
      dueDate: bill.dueDate || "",
      tags: (bill.tags || []).join(", "),
      notes: bill.notes || "",
    });
    setProviderQuery(bill.providerName || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveBill() {
    setSavingBill(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(
        editingBillId
          ? `/api/bill-payments/bills/${editingBillId}`
          : "/api/bill-payments/bills",
        {
          method: editingBillId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...billForm,
            tags: billForm.tags
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          }),
        },
      );
      await getJsonOrThrow(response, "Unable to save bill.");
      setNotice(editingBillId ? "Bill updated." : "Bill added.");
      resetBillForm();
      await loadDashboard();
    } catch (saveError) {
      setError(saveError.message || "Unable to save bill.");
    } finally {
      setSavingBill(false);
    }
  }

  async function deleteBill(id) {
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/bill-payments/bills/${id}`, {
        method: "DELETE",
      });
      await getJsonOrThrow(response, "Unable to delete bill.");
      setSelectedBillIds((current) =>
        current.filter((billId) => billId !== id),
      );
      if (editingBillId === id) resetBillForm();
      setNotice("Bill removed.");
      await loadDashboard();
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete bill.");
    }
  }

  async function startPaymentMethodSetup(methodType) {
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(
        "/api/bill-payments/payment-methods/setup-intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ methodType }),
        },
      );
      const payload = await getJsonOrThrow(
        response,
        "Unable to prepare payment method setup.",
      );
      setSetupIntentState({
        active: true,
        clientSecret: payload.data.clientSecret,
        methodType,
      });
    } catch (setupError) {
      setError(setupError.message || "Unable to prepare payment method setup.");
    }
  }

  async function markMethodDefault(id) {
    setError("");
    try {
      const response = await apiFetch(
        `/api/bill-payments/payment-methods/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true, allowAutopay: true }),
        },
      );
      await getJsonOrThrow(response, "Unable to update payment method.");
      await loadDashboard();
    } catch (methodError) {
      setError(methodError.message || "Unable to update payment method.");
    }
  }

  async function removeMethod(id) {
    setError("");
    try {
      const response = await apiFetch(
        `/api/bill-payments/payment-methods/${id}`,
        {
          method: "DELETE",
        },
      );
      await getJsonOrThrow(response, "Unable to remove payment method.");
      setNotice("Payment method removed.");
      await loadDashboard();
    } catch (methodError) {
      setError(methodError.message || "Unable to remove payment method.");
    }
  }

  async function launchPlaidLink(existingMethod = null) {
    if (!canManageSensitiveData || plaidLaunching) {
      return;
    }

    setPlaidLaunching(true);
    setError("");
    setNotice("");

    try {
      const scriptPlaid = await loadPlaidScript();
      if (!scriptPlaid?.create) {
        throw new Error("Plaid Link did not initialize correctly");
      }

      const tokenResponse = await apiFetch(
        "/api/bill-payments/payment-methods/plaid/link-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: "en" }),
        },
      );
      const tokenPayload = await getJsonOrThrow(
        tokenResponse,
        "Unable to prepare Plaid bank linking.",
      );

      await new Promise((resolve, reject) => {
        const handler = scriptPlaid.create({
          token: tokenPayload.data.link_token,
          onSuccess: async (publicToken, metadata) => {
            try {
              const selectedAccountId = metadata.accounts?.[0]?.id || "";
              const exchangeResponse = await apiFetch(
                "/api/bill-payments/payment-methods/plaid/exchange",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    publicToken,
                    accountId: selectedAccountId,
                    setDefault: false,
                  }),
                },
              );
              await getJsonOrThrow(
                exchangeResponse,
                "Unable to save the linked bank account.",
              );
              setNotice(
                existingMethod
                  ? "Plaid bank connection refreshed. The linked account details were updated."
                  : "Bank account linked through Plaid. It is saved for verification and upcoming processor support.",
              );
              await loadDashboard();
              resolve();
            } catch (linkError) {
              reject(linkError);
            } finally {
              handler.destroy();
            }
          },
          onExit: (plaidError) => {
            handler.destroy();
            if (plaidError?.error_message) {
              reject(new Error(plaidError.error_message));
              return;
            }
            resolve();
          },
        });

        handler.open();
      });
    } catch (plaidError) {
      setError(plaidError.message || "Unable to link bank account with Plaid.");
    } finally {
      setPlaidLaunching(false);
    }
  }

  async function paySelectedBills() {
    if (!selectedBillIds.length) {
      setError("Select at least one bill to pay.");
      return;
    }
    setPaying(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/bill-payments/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billIds: selectedBillIds,
          paymentMethodId: selectedPaymentMethodId,
        }),
      });
      const payload = await getJsonOrThrow(
        response,
        "Unable to submit bill payment.",
      );
      const failureCount = payload.data.failures?.length || 0;
      setNotice(
        failureCount > 0
          ? `Submitted ${payload.data.transactions.length} payments with ${failureCount} failures.`
          : `Submitted ${payload.data.transactions.length} bill payment${payload.data.transactions.length === 1 ? "" : "s"}.`,
      );
      setSelectedBillIds([]);
      await loadDashboard();
    } catch (paymentError) {
      setError(paymentError.message || "Unable to submit bill payment.");
    } finally {
      setPaying(false);
    }
  }

  async function exportBillsCsv() {
    setError("");
    try {
      const response = await apiFetch("/api/bill-payments/export");
      if (!response.ok) {
        throw new Error("Unable to export CSV.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "bill-payments.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (exportError) {
      setError(exportError.message || "Unable to export CSV.");
    }
  }

  async function saveAutopay(billId) {
    const draft = autopayDrafts[billId];
    if (!draft) return;
    setAutopaySavingId(billId);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(
        `/api/bill-payments/bills/${billId}/autopay`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      await getJsonOrThrow(response, "Unable to update AutoPay.");
      setNotice("AutoPay updated.");
      await loadDashboard();
    } catch (autopayError) {
      setError(autopayError.message || "Unable to update AutoPay.");
    } finally {
      setAutopaySavingId("");
    }
  }

  const pageGradient =
    "linear-gradient(135deg, rgba(8,145,178,0.08), rgba(14,165,233,0.02) 40%, rgba(249,115,22,0.08))";

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px",
        background: pageGradient,
        fontFamily: "'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gap: 20 }}
      >
        <section
          style={{
            borderRadius: 28,
            padding: "28px 28px 24px",
            background:
              "radial-gradient(circle at top left, rgba(16,185,129,0.18), transparent 34%), #0f172a",
            color: "#e2e8f0",
            boxShadow: "0 30px 80px rgba(15,23,42,0.18)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ maxWidth: 760 }}>
              <div
                style={{
                  display: "inline-flex",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(148, 163, 184, 0.16)",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                AP, utilities, suppliers, and recurring charges in one workspace
              </div>
              <h1
                style={{
                  fontSize: "clamp(2rem, 4vw, 3.8rem)",
                  lineHeight: 1.02,
                  margin: "16px 0 14px",
                }}
              >
                Pay every operational bill without leaving the app.
              </h1>
              <p
                style={{
                  margin: 0,
                  maxWidth: 640,
                  color: "rgba(226,232,240,0.82)",
                  fontSize: 16,
                }}
              >
                Save ACH and card methods, run bulk payments, schedule AutoPay,
                and keep bill history tied to the same tenant controls as
                invoices and client work.
              </p>
            </div>
            <div
              style={{
                minWidth: 260,
                display: "grid",
                gap: 12,
                alignContent: "start",
              }}
            >
              <div
                style={{
                  padding: 16,
                  borderRadius: 20,
                  background: "rgba(15,23,42,0.35)",
                  border: "1px solid rgba(148,163,184,0.16)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    color: "#94a3b8",
                    letterSpacing: "0.08em",
                  }}
                >
                  Open balance
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>
                  {formatCurrency(stats.totalDue)}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    background: "rgba(15,23,42,0.35)",
                    border: "1px solid rgba(148,163,184,0.16)",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    {stats.openCount}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    Open bills
                  </div>
                </div>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    background: "rgba(15,23,42,0.35)",
                    border: "1px solid rgba(148,163,184,0.16)",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    {stats.scheduledAutopay}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    AutoPay live
                  </div>
                </div>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    background: "rgba(15,23,42,0.35)",
                    border: "1px solid rgba(148,163,184,0.16)",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    {stats.recentPayments}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    Paid recently
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {(error || notice) && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 18,
              background: error
                ? "rgba(239,68,68,0.08)"
                : "rgba(16,185,129,0.10)",
              color: error ? "#991b1b" : "#065f46",
              border: `1px solid ${error ? "rgba(239,68,68,0.18)" : "rgba(16,185,129,0.18)"}`,
            }}
          >
            {error || notice}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
          }}
        >
          <section
            style={{
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(14px)",
              borderRadius: 24,
              border: "1px solid rgba(15,23,42,0.08)",
              padding: 24,
              boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 28, color: "#0f172a" }}>
                  Bill register and bulk pay queue
                </h2>
                <p style={{ margin: "8px 0 0", color: "#475569" }}>
                  Add utility, supplier, rent, insurance, or subscription bills
                  and submit them in one batch.
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <input
                  value={filterQuery}
                  onChange={(event) => setFilterQuery(event.target.value)}
                  placeholder="Search provider, account, or tag"
                  style={{
                    minWidth: 220,
                    borderRadius: 999,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                  }}
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                  }}
                >
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="overdue">Overdue</option>
                  <option value="processing">Processing</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                </select>
                <select
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                  }}
                >
                  <option value="all">All tags</option>
                  {knownTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={exportBillsCsv}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(15,23,42,0.14)",
                    background: "#fff",
                    color: "#0f172a",
                    padding: "12px 16px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={paySelectedBills}
                disabled={
                  !canManageSensitiveData ||
                  !selectedBillIds.length ||
                  paying ||
                  !executablePaymentMethods.length
                }
                style={{
                  border: 0,
                  borderRadius: 999,
                  background: !canManageSensitiveData ? "#94a3b8" : "#0f766e",
                  color: "#fff",
                  padding: "12px 18px",
                  fontWeight: 700,
                  cursor: canManageSensitiveData ? "pointer" : "not-allowed",
                }}
              >
                {paying
                  ? "Submitting payments..."
                  : `Pay selected (${selectedBillIds.length})`}
              </button>
              {!canManageSensitiveData && (
                <span style={{ color: "#64748b", fontSize: 14 }}>
                  Sensitive bill payments require elevated workspace access.
                </span>
              )}
              {canManageSensitiveData &&
                paymentMethods.length > 0 &&
                executablePaymentMethods.length === 0 && (
                  <span style={{ color: "#92400e", fontSize: 14 }}>
                    Plaid-linked accounts are saved successfully, but bill execution still requires at least one Stripe-backed payment method.
                  </span>
                )}
            </div>

            <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
              {loading
                ? <div style={{ padding: 20, color: "#475569" }}>
                    Loading Bill Payments...
                  </div>
                : filteredBills.length === 0
                  ? <div
                      style={{
                        padding: 24,
                        borderRadius: 22,
                        background: "rgba(15,23,42,0.03)",
                        color: "#475569",
                      }}
                    >
                      No bills match the current filters.
                    </div>
                  : filteredBills.map((bill) => {
                      const selected = selectedBillIds.includes(bill.id);
                      const draft =
                        autopayDrafts[bill.id] || initialAutopayDraft;
                      return (
                        <article
                          key={bill.id}
                          style={{
                            borderRadius: 22,
                            border: selected
                              ? "1px solid rgba(14,165,233,0.45)"
                              : "1px solid rgba(15,23,42,0.08)",
                            background: selected
                              ? "rgba(14,165,233,0.04)"
                              : "#fff",
                            padding: 18,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 14,
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: 14,
                                alignItems: "flex-start",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(event) =>
                                  setSelectedBillIds((current) =>
                                    event.target.checked
                                      ? [...current, bill.id]
                                      : current.filter((id) => id !== bill.id),
                                  )
                                }
                                style={{ marginTop: 4 }}
                              />
                              <div>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 10,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <h3
                                    style={{
                                      margin: 0,
                                      fontSize: 20,
                                      color: "#0f172a",
                                    }}
                                  >
                                    {bill.providerName}
                                  </h3>
                                  <span
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: 999,
                                      background:
                                        bill.status === "paid"
                                          ? "rgba(16,185,129,0.14)"
                                          : bill.status === "overdue"
                                            ? "rgba(239,68,68,0.12)"
                                            : bill.status === "processing"
                                              ? "rgba(245,158,11,0.14)"
                                              : "rgba(15,23,42,0.08)",
                                      color:
                                        bill.status === "paid"
                                          ? "#065f46"
                                          : bill.status === "overdue"
                                            ? "#991b1b"
                                            : bill.status === "processing"
                                              ? "#92400e"
                                              : "#334155",
                                      fontWeight: 700,
                                      fontSize: 12,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.08em",
                                    }}
                                  >
                                    {bill.status}
                                  </span>
                                  {bill.autopayEnabled && (
                                    <span
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        background: "rgba(15,118,110,0.10)",
                                        color: "#0f766e",
                                        fontSize: 12,
                                        fontWeight: 700,
                                      }}
                                    >
                                      AutoPay on
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    marginTop: 8,
                                    color: "#475569",
                                    fontSize: 14,
                                  }}
                                >
                                  {bill.accountLabel || "General account"}
                                  {bill.accountReferenceMasked
                                    ? ` | ${bill.accountReferenceMasked}`
                                    : ""}
                                </div>
                                <div
                                  style={{
                                    marginTop: 10,
                                    display: "flex",
                                    gap: 12,
                                    flexWrap: "wrap",
                                    color: "#334155",
                                    fontSize: 14,
                                  }}
                                >
                                  <span>Due {formatDate(bill.dueDate)}</span>
                                  <span>
                                    {formatCurrency(
                                      bill.amountDue,
                                      bill.currency,
                                    )}
                                  </span>
                                  {bill.minimumAmount != null && (
                                    <span>
                                      Minimum{" "}
                                      {formatCurrency(
                                        bill.minimumAmount,
                                        bill.currency,
                                      )}
                                    </span>
                                  )}
                                  <span>{bill.source}</span>
                                </div>
                                {!!bill.tags?.length && (
                                  <div
                                    style={{
                                      marginTop: 12,
                                      display: "flex",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {bill.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        style={{
                                          padding: "6px 10px",
                                          borderRadius: 999,
                                          background: "rgba(14,165,233,0.08)",
                                          color: "#0369a1",
                                          fontSize: 12,
                                          fontWeight: 700,
                                        }}
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                flexWrap: "wrap",
                                alignItems: "flex-start",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => selectBillForEdit(bill)}
                                style={{
                                  borderRadius: 999,
                                  border: "1px solid rgba(15,23,42,0.14)",
                                  background: "#fff",
                                  color: "#0f172a",
                                  padding: "10px 14px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveAutopayBillId((current) =>
                                    current === bill.id ? "" : bill.id,
                                  )
                                }
                                style={{
                                  borderRadius: 999,
                                  border: "1px solid rgba(15,23,42,0.14)",
                                  background: "#fff",
                                  color: "#0f172a",
                                  padding: "10px 14px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                {activeAutopayBillId === bill.id
                                  ? "Close AutoPay"
                                  : "Configure AutoPay"}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteBill(bill.id)}
                                style={{
                                  borderRadius: 999,
                                  border: "1px solid rgba(239,68,68,0.24)",
                                  background: "#fff5f5",
                                  color: "#b91c1c",
                                  padding: "10px 14px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {activeAutopayBillId === bill.id && (
                            <div
                              style={{
                                marginTop: 18,
                                paddingTop: 18,
                                borderTop: "1px solid rgba(15,23,42,0.08)",
                                display: "grid",
                                gap: 12,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: 18,
                                  flexWrap: "wrap",
                                }}
                              >
                                <label
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={draft.enabled}
                                    onChange={(event) =>
                                      setAutopayDrafts((current) => ({
                                        ...current,
                                        [bill.id]: {
                                          ...draft,
                                          enabled: event.target.checked,
                                        },
                                      }))
                                    }
                                  />
                                  Enable AutoPay
                                </label>
                                <label
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={draft.paused}
                                    onChange={(event) =>
                                      setAutopayDrafts((current) => ({
                                        ...current,
                                        [bill.id]: {
                                          ...draft,
                                          paused: event.target.checked,
                                        },
                                      }))
                                    }
                                  />
                                  Pause temporarily
                                </label>
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(160px, 1fr))",
                                  gap: 12,
                                }}
                              >
                                <select
                                  value={draft.paymentMethodId}
                                  onChange={(event) =>
                                    setAutopayDrafts((current) => ({
                                      ...current,
                                      [bill.id]: {
                                        ...draft,
                                        paymentMethodId: event.target.value,
                                      },
                                    }))
                                  }
                                  style={{
                                    borderRadius: 14,
                                    border: "1px solid rgba(15,23,42,0.12)",
                                    padding: "12px 14px",
                                  }}
                                >
                                  <option value="">
                                    Choose payment method
                                  </option>
                                  {executablePaymentMethods.map((method) => (
                                    <option key={method.id} value={method.id}>
                                      {method.methodLabel}
                                      {method.isDefault ? " | Default" : ""}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={draft.ruleType}
                                  onChange={(event) =>
                                    setAutopayDrafts((current) => ({
                                      ...current,
                                      [bill.id]: {
                                        ...draft,
                                        ruleType: event.target.value,
                                      },
                                    }))
                                  }
                                  style={{
                                    borderRadius: 14,
                                    border: "1px solid rgba(15,23,42,0.12)",
                                    padding: "12px 14px",
                                  }}
                                >
                                  <option value="full_balance">
                                    Full balance
                                  </option>
                                  <option value="fixed_amount">
                                    Fixed amount
                                  </option>
                                  <option value="minimum_amount">
                                    Minimum amount
                                  </option>
                                </select>
                                <select
                                  value={draft.scheduleType}
                                  onChange={(event) =>
                                    setAutopayDrafts((current) => ({
                                      ...current,
                                      [bill.id]: {
                                        ...draft,
                                        scheduleType: event.target.value,
                                      },
                                    }))
                                  }
                                  style={{
                                    borderRadius: 14,
                                    border: "1px solid rgba(15,23,42,0.12)",
                                    padding: "12px 14px",
                                  }}
                                >
                                  <option value="due_date">On due date</option>
                                  <option value="days_before_due">
                                    Days before due
                                  </option>
                                  <option value="monthly_date">
                                    Monthly date
                                  </option>
                                </select>
                                {draft.ruleType === "fixed_amount" && (
                                  <input
                                    value={draft.fixedAmount}
                                    onChange={(event) =>
                                      setAutopayDrafts((current) => ({
                                        ...current,
                                        [bill.id]: {
                                          ...draft,
                                          fixedAmount: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Fixed amount"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    style={{
                                      borderRadius: 14,
                                      border: "1px solid rgba(15,23,42,0.12)",
                                      padding: "12px 14px",
                                    }}
                                  />
                                )}
                                {draft.scheduleType === "days_before_due" && (
                                  <input
                                    value={draft.daysBeforeDue}
                                    onChange={(event) =>
                                      setAutopayDrafts((current) => ({
                                        ...current,
                                        [bill.id]: {
                                          ...draft,
                                          daysBeforeDue: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Days before due"
                                    type="number"
                                    min="1"
                                    max="30"
                                    style={{
                                      borderRadius: 14,
                                      border: "1px solid rgba(15,23,42,0.12)",
                                      padding: "12px 14px",
                                    }}
                                  />
                                )}
                                {draft.scheduleType === "monthly_date" && (
                                  <input
                                    value={draft.monthlyDay}
                                    onChange={(event) =>
                                      setAutopayDrafts((current) => ({
                                        ...current,
                                        [bill.id]: {
                                          ...draft,
                                          monthlyDay: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Monthly day"
                                    type="number"
                                    min="1"
                                    max="28"
                                    style={{
                                      borderRadius: 14,
                                      border: "1px solid rgba(15,23,42,0.12)",
                                      padding: "12px 14px",
                                    }}
                                  />
                                )}
                                <input
                                  value={draft.notifyDaysBefore}
                                  onChange={(event) =>
                                    setAutopayDrafts((current) => ({
                                      ...current,
                                      [bill.id]: {
                                        ...draft,
                                        notifyDaysBefore: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Reminder lead days"
                                  type="number"
                                  min="0"
                                  max="30"
                                  style={{
                                    borderRadius: 14,
                                    border: "1px solid rgba(15,23,42,0.12)",
                                    padding: "12px 14px",
                                  }}
                                />
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ color: "#64748b", fontSize: 14 }}>
                                  Upcoming reminders post into workspace
                                  notifications before the charge runs.
                                </div>
                                <button
                                  type="button"
                                  onClick={() => saveAutopay(bill.id)}
                                  disabled={
                                    !canManageSensitiveData ||
                                    autopaySavingId === bill.id
                                  }
                                  style={{
                                    border: 0,
                                    borderRadius: 999,
                                    background: "#0f766e",
                                    color: "#fff",
                                    padding: "10px 16px",
                                    fontWeight: 700,
                                    cursor: canManageSensitiveData
                                      ? "pointer"
                                      : "not-allowed",
                                  }}
                                >
                                  {autopaySavingId === bill.id
                                    ? "Saving AutoPay..."
                                    : "Save AutoPay"}
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
            </div>
          </section>

          <div style={{ display: "grid", gap: 20 }}>
            <section
              style={{
                background: "rgba(255,255,255,0.92)",
                borderRadius: 24,
                border: "1px solid rgba(15,23,42,0.08)",
                padding: 22,
                boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
              }}
            >
              <h2 style={{ margin: 0, color: "#0f172a" }}>
                {editingBillId ? "Update bill" : "Add a bill"}
              </h2>
              <p style={{ color: "#475569", marginTop: 8 }}>
                Search the provider catalog or create a custom payee with tags
                for operations, rent, fleet, or vendor spend.
              </p>
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <div style={{ position: "relative" }}>
                  <input
                    value={providerQuery}
                    onChange={(event) => {
                      setProviderQuery(event.target.value);
                      setBillForm((current) => ({
                        ...current,
                        providerName: event.target.value,
                        providerId: "",
                      }));
                    }}
                    placeholder="Search provider or enter custom payee"
                    style={{
                      width: "100%",
                      borderRadius: 16,
                      border: "1px solid rgba(15,23,42,0.12)",
                      padding: "14px 16px",
                    }}
                  />
                  {providerQuery.trim().length >= 2 && providers.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        right: 0,
                        zIndex: 20,
                        background: "#fff",
                        borderRadius: 18,
                        border: "1px solid rgba(15,23,42,0.10)",
                        boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
                        overflow: "hidden",
                      }}
                    >
                      {providers.slice(0, 6).map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => {
                            setBillForm((current) => ({
                              ...current,
                              providerId: provider.id,
                              providerName: provider.providerName,
                            }));
                            setProviderQuery(provider.providerName);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            background: "#fff",
                            border: 0,
                            padding: "12px 14px",
                            cursor: "pointer",
                            borderBottom: "1px solid rgba(15,23,42,0.06)",
                          }}
                        >
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>
                            {provider.providerName}
                          </div>
                          <div style={{ fontSize: 13, color: "#64748b" }}>
                            {provider.category}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  value={billForm.accountLabel}
                  onChange={(event) =>
                    setBillForm((current) => ({
                      ...current,
                      accountLabel: event.target.value,
                    }))
                  }
                  placeholder="Account label"
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                  }}
                />
                <input
                  value={billForm.accountNumber}
                  onChange={(event) =>
                    setBillForm((current) => ({
                      ...current,
                      accountNumber: event.target.value,
                    }))
                  }
                  placeholder="Account or member number"
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                  }}
                />
                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <input
                    value={billForm.amountDue}
                    onChange={(event) =>
                      setBillForm((current) => ({
                        ...current,
                        amountDue: event.target.value,
                      }))
                    }
                    placeholder="Amount due"
                    type="number"
                    min="0"
                    step="0.01"
                    style={{
                      borderRadius: 16,
                      border: "1px solid rgba(15,23,42,0.12)",
                      padding: "14px 16px",
                    }}
                  />
                  <input
                    value={billForm.minimumAmount}
                    onChange={(event) =>
                      setBillForm((current) => ({
                        ...current,
                        minimumAmount: event.target.value,
                      }))
                    }
                    placeholder="Minimum amount"
                    type="number"
                    min="0"
                    step="0.01"
                    style={{
                      borderRadius: 16,
                      border: "1px solid rgba(15,23,42,0.12)",
                      padding: "14px 16px",
                    }}
                  />
                </div>
                <input
                  value={billForm.dueDate}
                  onChange={(event) =>
                    setBillForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                  type="date"
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                  }}
                />
                <input
                  value={billForm.tags}
                  onChange={(event) =>
                    setBillForm((current) => ({
                      ...current,
                      tags: event.target.value,
                    }))
                  }
                  placeholder="Tags separated by commas"
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                  }}
                />
                <textarea
                  value={billForm.notes}
                  onChange={(event) =>
                    setBillForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Internal note or payment instruction"
                  rows={4}
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={saveBill}
                    disabled={savingBill}
                    style={{
                      border: 0,
                      borderRadius: 999,
                      background: "#0f766e",
                      color: "#fff",
                      padding: "12px 18px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {savingBill
                      ? "Saving..."
                      : editingBillId
                        ? "Update bill"
                        : "Add bill"}
                  </button>
                  <button
                    type="button"
                    onClick={resetBillForm}
                    style={{
                      borderRadius: 999,
                      border: "1px solid rgba(15,23,42,0.14)",
                      background: "#fff",
                      color: "#0f172a",
                      padding: "12px 18px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </section>

            <section
              style={{
                background: "rgba(255,255,255,0.92)",
                borderRadius: 24,
                border: "1px solid rgba(15,23,42,0.08)",
                padding: 22,
                boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, color: "#0f172a" }}>
                    Saved payment methods
                  </h2>
                  <p style={{ color: "#475569", marginTop: 8 }}>
                    Vault card, debit, and ACH credentials through Stripe.
                    AutoPay only uses saved methods with sensitive-data access.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => startPaymentMethodSetup("card")}
                    disabled={!canManageSensitiveData || !stripePromise}
                    style={{
                      borderRadius: 999,
                      border: 0,
                      background: "#0f766e",
                      color: "#fff",
                      padding: "10px 16px",
                      fontWeight: 700,
                      cursor: canManageSensitiveData
                        ? "pointer"
                        : "not-allowed",
                    }}
                  >
                    Add card/debit
                  </button>
                  <button
                    type="button"
                    onClick={() => startPaymentMethodSetup("bank_account")}
                    disabled={!canManageSensitiveData || !stripePromise}
                    style={{
                      borderRadius: 999,
                      border: "1px solid rgba(15,23,42,0.14)",
                      background: "#fff",
                      color: "#0f172a",
                      padding: "10px 16px",
                      fontWeight: 700,
                      cursor: canManageSensitiveData
                        ? "pointer"
                        : "not-allowed",
                    }}
                  >
                    Add ACH
                  </button>
                  <button
                    type="button"
                    onClick={launchPlaidLink}
                    disabled={!canManageSensitiveData || plaidLaunching}
                    style={{
                      borderRadius: 999,
                      border: "1px solid rgba(14,165,233,0.22)",
                      background: "rgba(14,165,233,0.08)",
                      color: "#075985",
                      padding: "10px 16px",
                      fontWeight: 700,
                      cursor: canManageSensitiveData ? "pointer" : "not-allowed",
                    }}
                  >
                    {plaidLaunching ? "Opening Plaid..." : "Link bank via Plaid"}
                  </button>
                </div>
              </div>

              {setupIntentState.active &&
                setupIntentState.clientSecret &&
                stripePromise && (
                  <div style={{ marginTop: 16 }}>
                    <Elements
                      stripe={stripePromise}
                      options={{
                        clientSecret: setupIntentState.clientSecret,
                        appearance: {
                          theme: "flat",
                          variables: {
                            colorPrimary: "#0f766e",
                            borderRadius: "14px",
                          },
                        },
                      }}
                    >
                      <PaymentMethodSetupForm
                        methodType={setupIntentState.methodType}
                        saving={savingMethod}
                        setSaving={setSavingMethod}
                        onCancel={() =>
                          setSetupIntentState({
                            active: false,
                            clientSecret: "",
                            methodType: "card",
                          })
                        }
                        onError={setError}
                        onSaved={async () => {
                          setSetupIntentState({
                            active: false,
                            clientSecret: "",
                            methodType: "card",
                          });
                          setNotice("Payment method saved.");
                          await loadDashboard();
                        }}
                      />
                    </Elements>
                  </div>
                )}

              <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
                {paymentMethods.length === 0
                  ? <div
                      style={{
                        padding: 16,
                        borderRadius: 18,
                        background: "rgba(15,23,42,0.04)",
                        color: "#475569",
                      }}
                    >
                      No saved payment methods yet.
                    </div>
                  : paymentMethods.map((method) => (
                      <div
                        key={method.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          padding: 16,
                          borderRadius: 18,
                          border: "1px solid rgba(15,23,42,0.08)",
                          background: method.isDefault
                            ? "rgba(16,185,129,0.06)"
                            : "#fff",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>
                            {method.methodLabel}
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              color: "#64748b",
                              fontSize: 14,
                            }}
                          >
                            {method.methodType}{" "}
                            {method.brand ? `| ${method.brand}` : ""}{" "}
                            {method.bankName ? `| ${method.bankName}` : ""}{" "}
                            {method.provider ? `| ${method.provider}` : ""}
                          </div>
                          {method.provider === "plaid" && (
                            <div
                              style={{
                                marginTop: 6,
                                color: "#92400e",
                                fontSize: 13,
                              }}
                            >
                              Linked for verification. Bill execution stays on
                              Stripe-backed methods until the processor bridge
                              is enabled.
                            </div>
                          )}
                        </div>
                        <div
                          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                        >
                          {!method.isDefault && method.provider !== "plaid" && (
                            <button
                              type="button"
                              onClick={() => markMethodDefault(method.id)}
                              style={{
                                borderRadius: 999,
                                border: "1px solid rgba(15,23,42,0.14)",
                                background: "#fff",
                                color: "#0f172a",
                                padding: "10px 14px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Make default
                            </button>
                          )}
                          {method.provider === "plaid" && (
                            <button
                              type="button"
                              onClick={() => launchPlaidLink(method)}
                              disabled={plaidLaunching}
                              style={{
                                borderRadius: 999,
                                border: "1px solid rgba(14,165,233,0.22)",
                                background: "rgba(14,165,233,0.08)",
                                color: "#075985",
                                padding: "10px 14px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {plaidLaunching ? "Opening Plaid..." : "Reconnect"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeMethod(method.id)}
                            style={{
                              borderRadius: 999,
                              border: "1px solid rgba(239,68,68,0.24)",
                              background: "#fff5f5",
                              color: "#b91c1c",
                              padding: "10px 14px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
              </div>
            </section>
            <section
              style={{
                background: "rgba(255,255,255,0.92)",
                borderRadius: 24,
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
              }}
            >
              <h2 style={{ margin: 0, color: "#0f172a" }}>
                Recent bill payment activity
              </h2>
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {recentTransactions.length === 0
                  ? <div
                      style={{
                        padding: 16,
                        borderRadius: 18,
                        background: "rgba(15,23,42,0.04)",
                        color: "#475569",
                      }}
                    >
                      No bill payment activity yet.
                    </div>
                  : recentTransactions.slice(0, 8).map((transaction) => (
                      <div
                        key={transaction.id}
                        style={{
                          padding: 14,
                          borderRadius: 18,
                          border: "1px solid rgba(15,23,42,0.08)",
                          background: "#fff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>
                              {transaction.providerName}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                color: "#64748b",
                                fontSize: 14,
                              }}
                            >
                              {transaction.source} |{" "}
                              {formatDate(transaction.createdAt)}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 800, color: "#0f172a" }}>
                              {formatCurrency(
                                transaction.amount,
                                transaction.currency,
                              )}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                color:
                                  transaction.status === "paid"
                                    ? "#047857"
                                    : transaction.status === "failed"
                                      ? "#b91c1c"
                                      : "#92400e",
                                fontSize: 13,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                              }}
                            >
                              {transaction.status}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
