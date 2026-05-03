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
import { useParams, usePathname, useRouter } from "next/navigation";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  BILL_ACCOUNT_NUMBER_MAX_LENGTH,
  getBillAccountNumberError,
  isValidBillAccountNumber,
} from "@/lib/bill-payments-validation";
import { useCurrentUserAccess } from "@/lib/current-user-client";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const BILL_CATEGORIES = [
  { id: "utilities",      label: "Utilities",             icon: "⚡", defaultTags: ["utility"] },
  { id: "credit_card",   label: "Credit Cards",           icon: "💳", defaultTags: ["credit"] },
  { id: "equipment",     label: "Equipment",              icon: "🛠️", defaultTags: ["equipment"] },
  { id: "vehicle",       label: "Truck / Vehicle",        icon: "🚛", defaultTags: ["vehicle", "fleet"] },
  { id: "insurance",     label: "Insurance",              icon: "🛡️", defaultTags: ["insurance"] },
  { id: "rent",          label: "Rent / Storage",         icon: "🏢", defaultTags: ["rent"] },
  { id: "payroll",       label: "Payroll / Subs",         icon: "👷", defaultTags: ["payroll"] },
  { id: "materials",     label: "Materials",              icon: "🧱", defaultTags: ["materials"] },
  { id: "internet",      label: "Internet / Phone",       icon: "📡", defaultTags: ["internet"] },
  { id: "subscriptions", label: "Subscriptions",          icon: "📦", defaultTags: ["subscription"] },
  { id: "general",       label: "General",                icon: "📄", defaultTags: [] },
];

// Categories where minimum payment field is prominently shown
const CATEGORIES_WITH_MIN_PAYMENT = new Set(["credit_card", "equipment", "vehicle"]);

const initialBillForm = {
  providerId: "",
  providerName: "",
  accountLabel: "",
  accountNumber: "",
  amountDue: "",
  minimumAmount: "",
  dueDate: "",
  category: "general",
  isRecurring: false,
  frequency: "monthly",
  tags: "",
  notes: "",
};

const REQUIRED_BILL_FIELD_MESSAGES = {
  providerName: "Provider is required",
  accountLabel: "Account label is required",
  amountDue: "Amount due is required",
  dueDate: "Due date is required",
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
  billingDetails,
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
        payment_method_data: {
          billing_details: {
            name: billingDetails?.name || "Cardholder",
            email: billingDetails?.email || undefined,
          },
        },
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
  const { authUser, capabilities } = useCurrentUserAccess();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
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
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedBillIds, setSelectedBillIds] = useState([]);
  const [bulkPaymentMethodId, setBulkPaymentMethodId] = useState("");
  const [bulkPaymentMethodMenuOpen, setBulkPaymentMethodMenuOpen] =
    useState(false);
  const [billFormErrors, setBillFormErrors] = useState({});
  const [activeAutopayBillId, setActiveAutopayBillId] = useState("");
  const [autopayDrafts, setAutopayDrafts] = useState({});
  const [setupIntentState, setSetupIntentState] = useState({
    active: false,
    clientSecret: "",
    methodType: "card",
  });
  const [savingMethod, setSavingMethod] = useState(false);
  const [plaidLaunching, setPlaidLaunching] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [billDrawerOpen, setBillDrawerOpen] = useState(false);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const deferredProviderQuery = useDeferredValue(providerQuery);
  const deferredFilterQuery = useDeferredValue(filterQuery);
  const routeBillId =
    typeof params?.id === "string" && params.id ? params.id : "";

  const canManageSensitiveData = capabilities.canManageSensitiveData;
  const bills = dashboard.bills || [];
  const recentTransactions = dashboard.recentTransactions || [];
  const executablePaymentMethods = useMemo(
    () => paymentMethods.filter((method) => method.provider !== "plaid"),
    [paymentMethods],
  );
  const selectedPaymentMethod = useMemo(
    () =>
      executablePaymentMethods.find((method) => method.id === bulkPaymentMethodId) ||
      executablePaymentMethods.find((method) => method.isDefault) ||
      executablePaymentMethods[0] ||
      null,
    [bulkPaymentMethodId, executablePaymentMethods],
  );
  const accountNumberError = useMemo(
    () => getBillAccountNumberError(billForm.accountNumber),
    [billForm.accountNumber],
  );

  function formatSelectedPaymentMethodLabel(method) {
    if (!method) return "Choose payment method";
    if (method.methodType === "bank_account") {
      return `${method.bankName || "Bank"} ending in ${method.last4 || "----"}`;
    }

    const brand = method.brand
      ? `${method.brand.charAt(0).toUpperCase()}${method.brand.slice(1)}`
      : "Card";
    return `${brand} ending in ${method.last4 || "----"}`;
  }

  function validateBillForm(currentForm) {
    const nextErrors = {};
    const currentAccountNumberError = getBillAccountNumberError(
      currentForm.accountNumber,
    );

    if (!currentForm.providerName.trim()) {
      nextErrors.providerName = REQUIRED_BILL_FIELD_MESSAGES.providerName;
    }
    if (!currentForm.accountLabel.trim()) {
      nextErrors.accountLabel = REQUIRED_BILL_FIELD_MESSAGES.accountLabel;
    }
    if (!String(currentForm.amountDue || "").trim()) {
      nextErrors.amountDue = REQUIRED_BILL_FIELD_MESSAGES.amountDue;
    }
    if (!String(currentForm.dueDate || "").trim()) {
      nextErrors.dueDate = REQUIRED_BILL_FIELD_MESSAGES.dueDate;
    }
    if (currentAccountNumberError) {
      nextErrors.accountNumber = currentAccountNumberError;
    }

    return nextErrors;
  }

  function handleAccountLabelChange(event) {
    setBillForm((current) => ({
      ...current,
      accountLabel: event.target.value,
    }));
    setBillFormErrors((current) => ({
      ...current,
      accountLabel: "",
    }));
  }

  function handleAccountNumberChange(event) {
    const nextValue = event.target.value;
    setBillForm((current) => ({
      ...current,
      accountNumber: nextValue,
    }));
    setBillFormErrors((current) => ({
      ...current,
      accountNumber: "",
    }));
  }

  function handleAmountDueChange(event) {
    setBillForm((current) => ({
      ...current,
      amountDue: event.target.value,
    }));
    setBillFormErrors((current) => ({
      ...current,
      amountDue: "",
    }));
  }

  function handleDueDateChange(event) {
    setBillForm((current) => ({
      ...current,
      dueDate: event.target.value,
    }));
    setBillFormErrors((current) => ({
      ...current,
      dueDate: "",
    }));
  }

  const stats = useMemo(() => {
    const openBills = bills.filter(
      (bill) => ["open", "overdue", "due_soon"].includes(bill.status),
    );
    const dueSoonBills = bills.filter((bill) => bill.status === "due_soon");
    const upcomingBills = bills.filter((bill) => bill.status === "upcoming");
    const scheduledAutopay = bills.filter((bill) => bill.autopayEnabled).length;
    const totalDue = openBills.reduce(
      (sum, bill) => sum + Number(bill.amountDue || 0),
      0,
    );
    return {
      openCount: openBills.length,
      dueSoonCount: dueSoonBills.length,
      upcomingCount: upcomingBills.length,
      scheduledAutopay,
      totalDue,
      recentPayments: recentTransactions.filter((tx) => tx.status === "paid")
        .length,
    };
  }, [bills, recentTransactions]);

  const selectedTotalAmount = useMemo(() => {
    if (!selectedBillIds.length) return 0;
    return bills
      .filter((bill) => selectedBillIds.includes(bill.id))
      .reduce((sum, bill) => sum + Number(bill.amountDue || 0), 0);
  }, [bills, selectedBillIds]);

  const categoryFieldHints = useMemo(() => {
    const selectedCategory =
      BILL_CATEGORIES.find((category) => category.id === billForm.category) ||
      BILL_CATEGORIES.find((category) => category.id === "general");
    const suggestionsByCategory = {
      credit_card: {
        providerPlaceholder: "Card issuer (e.g. Chase, AmEx)",
        accountLabelPlaceholder: "Business card",
        helper: "Track statement due date and required minimum payment.",
      },
      utilities: {
        providerPlaceholder: "Utility provider",
        accountLabelPlaceholder: "Main service account",
        helper: "Save account details to speed up monthly utility payments.",
      },
      equipment: {
        providerPlaceholder: "Lender or equipment financer",
        accountLabelPlaceholder: "Financing agreement",
        helper: "Use notes for term details, payoff date, and contract reference.",
      },
      vehicle: {
        providerPlaceholder: "Auto lender or leasing company",
        accountLabelPlaceholder: "Truck payment account",
        helper: "Keep fleet payment schedules visible with due date + minimum.",
      },
      default: {
        providerPlaceholder: "Provider / Payee",
        accountLabelPlaceholder: "Account label",
        helper: "Save a bill profile once and pay it from the same workflow.",
      },
    };
    const categoryHints =
      suggestionsByCategory[selectedCategory?.id] || suggestionsByCategory.default;
    return {
      selectedCategory,
      ...categoryHints,
    };
  }, [billForm.category]);

  const categoryAnalytics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return BILL_CATEGORIES.map((category) => {
      const billsInCategory = bills.filter(
        (bill) => (bill.category || "general") === category.id,
      );

      const openOrDue = billsInCategory.filter((bill) =>
        ["open", "due_soon", "overdue", "upcoming"].includes(bill.status),
      );
      const overdue = billsInCategory.filter((bill) => bill.status === "overdue");

      const totalDue = openOrDue.reduce(
        (sum, bill) => sum + Number(bill.amountDue || 0),
        0,
      );

      const paidThisMonth = billsInCategory.filter((bill) => {
        if (!bill.lastPaidAt) return false;
        const paidDate = new Date(bill.lastPaidAt);
        if (Number.isNaN(paidDate.getTime())) return false;
        return (
          paidDate.getMonth() === currentMonth &&
          paidDate.getFullYear() === currentYear
        );
      }).length;

      const overdueRate = billsInCategory.length
        ? Math.round((overdue.length / billsInCategory.length) * 100)
        : 0;

      return {
        ...category,
        totalBills: billsInCategory.length,
        totalDue,
        overdueRate,
        paidThisMonth,
      };
    }).filter((category) => category.totalBills > 0);
  }, [bills]);

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
      if (categoryFilter !== "all" && bill.category !== categoryFilter)
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
  }, [bills, deferredFilterQuery, statusFilter, tagFilter, categoryFilter]);

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
    if (typeof window === "undefined") return;

    const desktopPref = window.localStorage.getItem("billPayments.compactMode");
    const methodsPanelPref = window.localStorage.getItem(
      "billPayments.showPaymentMethods",
    );
    if (desktopPref === "true") {
      setCompactMode(true);
    } else if (desktopPref === "false") {
      setCompactMode(false);
    }
    if (methodsPanelPref === "true") {
      setShowPaymentMethods(true);
    } else if (methodsPanelPref === "false") {
      setShowPaymentMethods(false);
    }

    const updateViewportMode = () => {
      const isMobile = window.matchMedia("(max-width: 900px)").matches;
      setIsMobileViewport(isMobile);
      if (isMobile) {
        setCompactMode(true);
      }
    };

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobileViewport) return;
    window.localStorage.setItem("billPayments.compactMode", String(compactMode));
  }, [compactMode, isMobileViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "billPayments.showPaymentMethods",
      String(showPaymentMethods),
    );
  }, [showPaymentMethods]);

  useEffect(() => {
    if (deferredProviderQuery.trim().length < 2) {
      loadProviders();
      return;
    }
    loadProviders(deferredProviderQuery.trim());
  }, [deferredProviderQuery, loadProviders]);

  useEffect(() => {
    if (loading) return;

    if (pathname === "/bill-payments/new") {
      setBillDrawerOpen(true);
      if (editingBillId) {
        setEditingBillId("");
      }
      return;
    }

    if (pathname === "/bill-payments/categories") {
      setCategoryFilter("all");
      return;
    }

    if (routeBillId) {
      const targetBill = bills.find((bill) => bill.id === routeBillId);
      if (targetBill && editingBillId !== targetBill.id) {
        selectBillForEdit(targetBill, { navigate: false });
      }
    }
  }, [bills, editingBillId, loading, pathname, routeBillId]);

  const selectedPaymentMethodId = selectedPaymentMethod?.id || "";

  useEffect(() => {
    if (!executablePaymentMethods.length) {
      setBulkPaymentMethodId("");
      setBulkPaymentMethodMenuOpen(false);
      return;
    }

    setBulkPaymentMethodId((current) => {
      if (executablePaymentMethods.some((method) => method.id === current)) {
        return current;
      }
      const defaultMethod = executablePaymentMethods.find(
        (method) => method.isDefault,
      );
      return defaultMethod?.id || executablePaymentMethods[0]?.id || "";
    });
  }, [executablePaymentMethods]);

  function resetBillForm({ keepCurrentRoute = false } = {}) {
    setBillForm(initialBillForm);
    setBillFormErrors({});
    setEditingBillId("");
    setProviderQuery("");
    setProviderPickerOpen(false);
    setBillDrawerOpen(false);
    if (!keepCurrentRoute && pathname !== "/bill-payments") {
      router.replace("/bill-payments");
    }
  }

  function selectBillForEdit(bill, { navigate = true } = {}) {
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
      category: bill.category || "general",
      isRecurring: bill.isRecurring === true,
      frequency: bill.frequency || "monthly",
      tags: (bill.tags || []).join(", "),
      notes: bill.notes || "",
    });
    setBillFormErrors({});
    setProviderQuery(bill.providerName || "");
    setProviderPickerOpen(false);
    setBillDrawerOpen(true);
    if (navigate && pathname !== `/bill-payments/${bill.id}`) {
      router.push(`/bill-payments/${bill.id}`);
    }
  }

  async function saveBill() {
    const nextErrors = validateBillForm(billForm);
    setBillFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError(nextErrors.accountNumber || "Please fix the highlighted fields.");
      setNotice("");
      return;
    }

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
            isRecurring: billForm.isRecurring,
            frequency: billForm.isRecurring ? billForm.frequency : null,
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

  function openPaymentMethodSelector() {
    if (!canManageSensitiveData) {
      return;
    }
    if (!executablePaymentMethods.length && stripePromise) {
      startPaymentMethodSetup("card");
      return;
    }
    setBulkPaymentMethodMenuOpen((current) => !current);
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

  async function markAsPaid(id) {
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/bill-payments/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      await getJsonOrThrow(response, "Unable to mark bill as paid.");
      setNotice("Bill marked as paid.");
      await loadDashboard();
    } catch (markError) {
      setError(markError.message || "Unable to mark bill as paid.");
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

  async function paySelectedBills(billIds = selectedBillIds) {
    if (!billIds.length) {
      setError("Select at least one bill to pay.");
      return;
    }

    const payAmount = bills
      .filter((bill) => billIds.includes(bill.id))
      .reduce((sum, bill) => sum + Number(bill.amountDue || 0), 0);
    const confirmed = window.confirm(
      `Pay ${billIds.length} bill${billIds.length === 1 ? "" : "s"} for ${formatCurrency(payAmount)}?`,
    );
    if (!confirmed) return;

    setPaying(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/bill-payments/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billIds,
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
      if (billIds === selectedBillIds) {
        setSelectedBillIds([]);
      } else {
        setSelectedBillIds((current) =>
          current.filter((billId) => !billIds.includes(billId)),
        );
      }
      await loadDashboard();
    } catch (paymentError) {
      setError(paymentError.message || "Unable to submit bill payment.");
    } finally {
      setPaying(false);
    }
  }

  async function payBillNow(billId) {
    await paySelectedBills([billId]);
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

  if (true) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "clamp(14px, 2.5vw, 26px)",
          background:
            "radial-gradient(circle at 0% 0%, rgba(14,116,144,0.10), transparent 32%), radial-gradient(circle at 100% 100%, rgba(15,118,110,0.08), transparent 40%), #f3f6f9",
          fontFamily: "'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 1140,
            margin: "0 auto",
            display: "grid",
            gap: 18,
          }}
        >
          <section
            style={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(15,23,42,0.08)",
              borderRadius: 22,
              padding: "clamp(14px, 2vw, 22px)",
              boxShadow: "0 20px 40px rgba(15,23,42,0.06)",
              display: "grid",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: "clamp(1.55rem, 2.6vw, 2.15rem)",
                    color: "#0f172a",
                    letterSpacing: "-0.03em",
                    lineHeight: 1.08,
                  }}
                >
                  Bills & Payments
                </h1>
                <p style={{ margin: "7px 0 0", color: "#64748b", fontSize: 15 }}>
                  View, select, and pay bills fast.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingBillId("");
                  setBillForm(initialBillForm);
                  setBillFormErrors({});
                  setProviderQuery("");
                  setBillDrawerOpen(true);
                  if (pathname !== "/bill-payments/new") {
                    router.push("/bill-payments/new");
                  }
                }}
                style={{
                  border: 0,
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #0f766e, #0b5f5a)",
                  color: "#fff",
                  padding: "11px 17px",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 10px 20px rgba(15,118,110,0.26)",
                }}
              >
                + Add Bill
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (isMobileViewport) return;
                  setCompactMode((current) => !current);
                }}
                disabled={isMobileViewport}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(15,23,42,0.16)",
                  background: compactMode ? "#0f172a" : "#fff",
                  color: compactMode ? "#fff" : "#0f172a",
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: isMobileViewport ? "not-allowed" : "pointer",
                  opacity: isMobileViewport ? 0.72 : 1,
                }}
              >
                {isMobileViewport
                  ? "Compact: ON (Mobile)"
                  : compactMode
                    ? "Compact: ON"
                    : "Compact: OFF"}
              </button>
              <span
                style={{
                  borderRadius: 999,
                  background: "rgba(15,23,42,0.06)",
                  padding: "6px 10px",
                  color: "#334155",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Open Balance: {formatCurrency(stats.totalDue)}
              </span>
              <span
                style={{
                  borderRadius: 999,
                  background: "rgba(15,118,110,0.10)",
                  padding: "6px 10px",
                  color: "#0f766e",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Selected: {selectedBillIds.length} bill{selectedBillIds.length === 1 ? "" : "s"} ({formatCurrency(selectedTotalAmount)})
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 9,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,0.12)",
                  padding: "10px 11px",
                  background: "#fff",
                }}
              >
                <option value="all">Status: All</option>
                <option value="upcoming">Upcoming</option>
                <option value="open">Open</option>
                <option value="due_soon">Due soon</option>
                <option value="overdue">Overdue</option>
                <option value="processing">Processing</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,0.12)",
                  padding: "10px 11px",
                  background: "#fff",
                }}
              >
                <option value="all">Category: All</option>
                {BILL_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>

              <div
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setBulkPaymentMethodMenuOpen(false);
                  }
                }}
                style={{ position: "relative" }}
              >
                <button
                  type="button"
                  onClick={openPaymentMethodSelector}
                  disabled={!canManageSensitiveData || (!executablePaymentMethods.length && !stripePromise)}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "#fff",
                    color: "#0f172a",
                    padding: "10px 11px",
                    fontWeight: 600,
                    cursor:
                      canManageSensitiveData &&
                      (executablePaymentMethods.length || stripePromise)
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  {formatSelectedPaymentMethodLabel(selectedPaymentMethod)}
                </button>
                {bulkPaymentMethodMenuOpen && executablePaymentMethods.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      zIndex: 20,
                      background: "#fff",
                      borderRadius: 14,
                      border: "1px solid rgba(15,23,42,0.12)",
                      boxShadow: "0 14px 30px rgba(15,23,42,0.12)",
                      minWidth: 280,
                      overflow: "hidden",
                    }}
                  >
                    {executablePaymentMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => {
                          setBulkPaymentMethodId(method.id);
                          setBulkPaymentMethodMenuOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: 0,
                          background:
                            method.id === selectedPaymentMethodId
                              ? "rgba(15,118,110,0.08)"
                              : "#fff",
                          padding: "10px 12px",
                          cursor: "pointer",
                        }}
                      >
                        {formatSelectedPaymentMethodLabel(method)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
                  background: !canManageSensitiveData
                    ? "#94a3b8"
                    : "linear-gradient(135deg, #0f766e, #0b5f5a)",
                  color: "#fff",
                  padding: "11px 16px",
                  fontWeight: 700,
                  cursor: canManageSensitiveData ? "pointer" : "not-allowed",
                  boxShadow: canManageSensitiveData
                    ? "0 10px 20px rgba(15,118,110,0.24)"
                    : "none",
                }}
              >
                {paying
                  ? "Submitting..."
                  : `Pay Selected (${selectedBillIds.length}) • ${formatCurrency(selectedTotalAmount)}`}
              </button>
            </div>

            {(error || notice) && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${error ? "rgba(239,68,68,0.24)" : "rgba(16,185,129,0.22)"}`,
                  background: error ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                  color: error ? "#991b1b" : "#065f46",
                }}
              >
                {error || notice}
              </div>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {loading ? (
                <div style={{ padding: 18, color: "#64748b" }}>Loading bills...</div>
              ) : filteredBills.length === 0 ? (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid rgba(15,23,42,0.08)",
                    color: "#64748b",
                  }}
                >
                  No bills match the current filters.
                </div>
              ) : (
                filteredBills.map((bill) => {
                  const selected = selectedBillIds.includes(bill.id);
                  const statusLabel = bill.status === "due_soon"
                    ? "Due soon"
                    : bill.status === "overdue"
                      ? "Overdue"
                      : bill.status === "paid"
                        ? "Paid"
                        : bill.status;
                  const statusTone = bill.status === "overdue"
                    ? { bg: "rgba(239,68,68,0.12)", color: "#991b1b" }
                    : bill.status === "due_soon"
                      ? { bg: "rgba(245,158,11,0.18)", color: "#92400e" }
                      : bill.status === "paid"
                        ? { bg: "rgba(16,185,129,0.16)", color: "#065f46" }
                        : { bg: "rgba(15,23,42,0.08)", color: "#334155" };
                  return (
                    <article
                      key={bill.id}
                      style={{
                        border: selected
                          ? "1px solid rgba(15,118,110,0.42)"
                          : "1px solid rgba(15,23,42,0.10)",
                        background: selected ? "rgba(15,118,110,0.04)" : "#fff",
                        borderRadius: 16,
                        padding: compactMode ? "10px 11px" : "14px 14px 13px",
                        display: "grid",
                        gap: compactMode ? 7 : 10,
                        boxShadow: selected
                          ? "0 12px 24px rgba(15,118,110,0.10)"
                          : "0 6px 12px rgba(15,23,42,0.03)",
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
                        <label
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                            cursor: "pointer",
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
                            <div style={{ display: "flex", gap: compactMode ? 6 : 8, alignItems: "center", flexWrap: "wrap" }}>
                              <strong style={{ color: "#0f172a", fontSize: compactMode ? 15 : 17 }}>
                                {bill.providerName}
                              </strong>
                              <span
                                style={{
                                  padding: compactMode ? "2px 7px" : "3px 8px",
                                  borderRadius: 999,
                                  background: statusTone.bg,
                                  color: statusTone.color,
                                  fontSize: compactMode ? 10 : 11,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <div style={{ marginTop: compactMode ? 2 : 4, color: "#64748b", fontSize: compactMode ? 12 : 13 }}>
                              {bill.accountLabel || "General account"}
                              {bill.accountReferenceMasked
                                ? ` | ${bill.accountReferenceMasked}`
                                : ""}
                            </div>
                            <div style={{ marginTop: compactMode ? 4 : 6, display: "flex", gap: compactMode ? 10 : 14, color: "#334155", fontSize: compactMode ? 13 : 14, flexWrap: "wrap" }}>
                              <span>Due {formatDate(bill.dueDate)}</span>
                              <strong>{formatCurrency(bill.amountDue, bill.currency)}</strong>
                              <span>{(BILL_CATEGORIES.find((c) => c.id === bill.category)?.label) || "General"}</span>
                            </div>
                          </div>
                        </label>

                        <div style={{ display: "flex", gap: compactMode ? 6 : 8, flexWrap: "wrap" }}>
                          {bill.status !== "paid" && bill.status !== "processing" && (
                            <button
                              type="button"
                              onClick={() => payBillNow(bill.id)}
                              disabled={
                                !canManageSensitiveData ||
                                paying ||
                                !selectedPaymentMethodId
                              }
                              style={{
                                borderRadius: 999,
                                border: "1px solid rgba(15,118,110,0.28)",
                                background: "rgba(15,118,110,0.08)",
                                color: "#0f766e",
                                padding: compactMode ? "6px 10px" : "8px 12px",
                                fontWeight: 700,
                                cursor:
                                  canManageSensitiveData &&
                                  !paying &&
                                  selectedPaymentMethodId
                                    ? "pointer"
                                    : "not-allowed",
                              }}
                            >
                              Pay now
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => selectBillForEdit(bill)}
                            style={{
                              borderRadius: 999,
                              border: "1px solid rgba(15,23,42,0.14)",
                              background: "#fff",
                              color: "#0f172a",
                              padding: compactMode ? "6px 10px" : "8px 12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBill(bill.id)}
                            style={{
                              borderRadius: 999,
                              border: "1px solid rgba(239,68,68,0.24)",
                              background: "#fff5f5",
                              color: "#b91c1c",
                              padding: compactMode ? "6px 10px" : "8px 12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section
            style={{
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(15,23,42,0.08)",
              borderRadius: 16,
              padding: 14,
            }}
          >
            <button
              type="button"
              onClick={() => setShowPaymentMethods((current) => !current)}
              style={{
                border: 0,
                background: "transparent",
                color: "#0f172a",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {showPaymentMethods ? "Hide payment methods" : "Manage payment methods"}
            </button>

            {showPaymentMethods && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => startPaymentMethodSetup("card")}
                    disabled={!canManageSensitiveData || !stripePromise}
                    style={{
                      border: 0,
                      borderRadius: 999,
                      background: "#0f766e",
                      color: "#fff",
                      padding: "8px 12px",
                      fontWeight: 700,
                      cursor: canManageSensitiveData ? "pointer" : "not-allowed",
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
                      padding: "8px 12px",
                      fontWeight: 700,
                      cursor: canManageSensitiveData ? "pointer" : "not-allowed",
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
                      padding: "8px 12px",
                      fontWeight: 700,
                      cursor: canManageSensitiveData ? "pointer" : "not-allowed",
                    }}
                  >
                    {plaidLaunching ? "Opening Plaid..." : "Link bank via Plaid"}
                  </button>
                </div>

                {setupIntentState.active &&
                  setupIntentState.clientSecret &&
                  stripePromise && (
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
                        billingDetails={{
                          name:
                            authUser?.name ||
                            authUser?.fullName ||
                            authUser?.email ||
                            "",
                          email: authUser?.email || "",
                        }}
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
                        onSaved={async (method) => {
                          setSetupIntentState({
                            active: false,
                            clientSecret: "",
                            methodType: "card",
                          });
                          setBulkPaymentMethodId(method.id || "");
                          setBulkPaymentMethodMenuOpen(false);
                          setNotice(
                            method
                              ? `Selected ${formatSelectedPaymentMethodLabel(method)}.`
                              : "Payment method saved.",
                          );
                          await loadDashboard();
                        }}
                      />
                    </Elements>
                  )}

                <div style={{ display: "grid", gap: 8 }}>
                  {paymentMethods.length === 0 ? (
                    <div style={{ color: "#64748b" }}>No saved payment methods yet.</div>
                  ) : (
                    paymentMethods.map((method) => (
                      <div
                        key={method.id}
                        style={{
                          border: "1px solid rgba(15,23,42,0.1)",
                          borderRadius: 10,
                          padding: "8px 10px",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>
                            {method.methodLabel}
                          </div>
                          <div style={{ color: "#64748b", fontSize: 13 }}>
                            {method.provider || "stripe"}
                            {method.isDefault ? " | Default" : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {!method.isDefault && method.provider !== "plaid" && (
                            <button
                              type="button"
                              onClick={() => markMethodDefault(method.id)}
                              style={{
                                borderRadius: 999,
                                border: "1px solid rgba(15,23,42,0.14)",
                                background: "#fff",
                                color: "#0f172a",
                                padding: "6px 10px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Make default
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
                              padding: "6px 10px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {billDrawerOpen && (
          <>
            <button
              type="button"
              aria-label="Close drawer"
              onClick={() => resetBillForm({ keepCurrentRoute: false })}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15,23,42,0.44)",
                border: 0,
                padding: 0,
                margin: 0,
                cursor: "pointer",
                zIndex: 50,
              }}
            />
            <aside
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(480px, 100vw)",
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                zIndex: 60,
                borderLeft: "1px solid rgba(15,23,42,0.10)",
                boxShadow: "-20px 0 50px rgba(15,23,42,0.15)",
                overflowY: "auto",
                padding: 20,
                display: "grid",
                gap: 14,
                alignContent: "start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <h2 style={{ margin: 0, color: "#0f172a" }}>
                  {editingBillId ? "Edit bill" : "Add bill"}
                </h2>
                <button
                  type="button"
                  onClick={() => resetBillForm({ keepCurrentRoute: false })}
                  style={{
                    border: "1px solid rgba(15,23,42,0.14)",
                    borderRadius: 10,
                    background: "#fff",
                    color: "#0f172a",
                    padding: "6px 10px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <input
                  value={billForm.providerName}
                  onChange={(event) => {
                    setBillForm((current) => ({
                      ...current,
                      providerName: event.target.value,
                      providerId: "",
                    }));
                    setBillFormErrors((current) => ({ ...current, providerName: "" }));
                  }}
                  placeholder="Provider / Payee"
                  style={{
                    borderRadius: 12,
                    border: billFormErrors.providerName
                      ? "1px solid #dc2626"
                      : "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                  }}
                />
                {billFormErrors.providerName && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: -2 }}>
                    {billFormErrors.providerName}
                  </div>
                )}

                <input
                  value={billForm.accountLabel}
                  onChange={handleAccountLabelChange}
                  placeholder="Account label"
                  style={{
                    borderRadius: 12,
                    border: billFormErrors.accountLabel
                      ? "1px solid #dc2626"
                      : "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                  }}
                />
                {billFormErrors.accountLabel && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: -2 }}>
                    {billFormErrors.accountLabel}
                  </div>
                )}

                <input
                  value={billForm.accountNumber}
                  onChange={handleAccountNumberChange}
                  inputMode="numeric"
                  placeholder="Account or member number"
                  style={{
                    borderRadius: 12,
                    border: accountNumberError
                      ? "1px solid #dc2626"
                      : "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                  }}
                />
                {accountNumberError && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: -2 }}>
                    {accountNumberError}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input
                    value={billForm.amountDue}
                    onChange={handleAmountDueChange}
                    placeholder="Amount due"
                    type="number"
                    min="0"
                    step="0.01"
                    style={{
                      borderRadius: 12,
                      border: billFormErrors.amountDue
                        ? "1px solid #dc2626"
                        : "1px solid rgba(15,23,42,0.12)",
                      padding: "12px 14px",
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
                      borderRadius: 12,
                      border: "1px solid rgba(15,23,42,0.12)",
                      padding: "12px 14px",
                    }}
                  />
                </div>
                {billFormErrors.amountDue && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: -2 }}>
                    {billFormErrors.amountDue}
                  </div>
                )}

                <input
                  value={billForm.dueDate}
                  onChange={handleDueDateChange}
                  type="date"
                  style={{
                    borderRadius: 12,
                    border: billFormErrors.dueDate
                      ? "1px solid #dc2626"
                      : "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                  }}
                />
                {billFormErrors.dueDate && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: -2 }}>
                    {billFormErrors.dueDate}
                  </div>
                )}

                <select
                  value={billForm.category}
                  onChange={(event) =>
                    setBillForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                    background: "#fff",
                  }}
                >
                  {BILL_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "#f8fafc",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={billForm.isRecurring}
                    onChange={(event) =>
                      setBillForm((current) => ({
                        ...current,
                        isRecurring: event.target.checked,
                      }))
                    }
                  />
                  Recurring bill
                </label>

                {billForm.isRecurring && (
                  <select
                    value={billForm.frequency}
                    onChange={(event) =>
                      setBillForm((current) => ({
                        ...current,
                        frequency: event.target.value,
                      }))
                    }
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(15,23,42,0.12)",
                      padding: "12px 14px",
                      background: "#fff",
                    }}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                )}

                <textarea
                  value={billForm.notes}
                  onChange={(event) =>
                    setBillForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Internal note"
                  rows={3}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                    resize: "vertical",
                  }}
                />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={saveBill}
                    disabled={savingBill}
                    style={{
                      border: 0,
                      borderRadius: 999,
                      background: "#0f766e",
                      color: "#fff",
                      padding: "10px 14px",
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
                    onClick={() => resetBillForm({ keepCurrentRoute: false })}
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
                    Cancel
                  </button>
                </div>
              </div>
            </aside>
          </>
        )}
      </main>
    );
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
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
                    background: stats.dueSoonCount > 0 ? "rgba(245,158,11,0.22)" : "rgba(15,23,42,0.35)",
                    border: stats.dueSoonCount > 0 ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(148,163,184,0.16)",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800, color: stats.dueSoonCount > 0 ? "#f59e0b" : "inherit" }}>
                    {stats.dueSoonCount}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    Due soon
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
                    {stats.upcomingCount}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    Upcoming
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

        {pathname === "/bill-payments/categories" && (
          <section
            style={{
              background: "rgba(255,255,255,0.94)",
              borderRadius: 24,
              border: "1px solid rgba(15,23,42,0.08)",
              padding: 20,
              boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: "#0f172a", fontSize: 24 }}>
                  Category performance
                </h2>
                <p style={{ margin: "8px 0 0", color: "#64748b" }}>
                  Track what categories are carrying the most payable balance and risk.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/bill-payments")}
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
                Back to register
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              {categoryAnalytics.map((category) => (
                <article
                  key={category.id}
                  style={{
                    borderRadius: 18,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "#fff",
                    padding: 14,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <strong style={{ color: "#0f172a" }}>
                      {category.icon} {category.label}
                    </strong>
                    <span
                      style={{
                        borderRadius: 999,
                        background: "rgba(15,23,42,0.06)",
                        color: "#334155",
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "3px 8px",
                      }}
                    >
                      {category.totalBills} bill{category.totalBills === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#475569", fontSize: 13 }}>
                      <span>Total due</span>
                      <strong style={{ color: "#0f172a" }}>{formatCurrency(category.totalDue)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#475569", fontSize: 13 }}>
                      <span>Overdue rate</span>
                      <strong style={{ color: category.overdueRate > 25 ? "#b91c1c" : "#0f172a" }}>{category.overdueRate}%</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#475569", fontSize: 13 }}>
                      <span>Paid this month</span>
                      <strong style={{ color: "#065f46" }}>{category.paidThisMonth}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter(category.id);
                      router.push("/bill-payments");
                    }}
                    style={{
                      marginTop: 4,
                      borderRadius: 999,
                      border: "1px solid rgba(15,23,42,0.12)",
                      background: "#f8fafc",
                      color: "#0f172a",
                      padding: "8px 10px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Open in register
                  </button>
                </article>
              ))}

              {categoryAnalytics.length === 0 && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(15,23,42,0.03)",
                    color: "#475569",
                  }}
                >
                  No bill categories have activity yet.
                </div>
              )}
            </div>
          </section>
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
                  <option value="upcoming">🟢 Upcoming</option>
                  <option value="open">Open</option>
                  <option value="due_soon">⚠️ Due Soon</option>
                  <option value="overdue">🔴 Overdue</option>
                  <option value="processing">Processing</option>
                  <option value="paid">✅ Paid</option>
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
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "12px 14px",
                  }}
                >
                  <option value="all">All categories</option>
                  {BILL_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
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

            {/* ── Quick-add category buttons ─────────────────────── */}
            <div
              style={{
                marginTop: 16,
                overflowX: "auto",
                paddingBottom: 4,
              }}
            >
              <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
                {BILL_CATEGORIES.filter((c) => c.id !== "general").map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setBillForm((f) => ({
                        ...f,
                        category: cat.id,
                        accountLabel: cat.label,
                        tags: cat.defaultTags.join(", "),
                      }));
                      if (pathname !== "/bill-payments/new") {
                        router.push("/bill-payments/new");
                      }
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    style={{
                      borderRadius: 999,
                      border: "1.5px solid rgba(15,23,42,0.10)",
                      background: "#fff",
                      color: "#0f172a",
                      padding: "8px 14px",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
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
              <div
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setBulkPaymentMethodMenuOpen(false);
                  }
                }}
                style={{ position: "relative" }}
              >
                <button
                  type="button"
                  onClick={openPaymentMethodSelector}
                  disabled={!canManageSensitiveData || (!executablePaymentMethods.length && !stripePromise)}
                  style={{
                    minWidth: 260,
                    borderRadius: 18,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "#fff",
                    color: "#0f172a",
                    padding: "12px 16px",
                    fontWeight: 600,
                    display: "grid",
                    gap: 4,
                    textAlign: "left",
                    cursor: canManageSensitiveData &&
                      (executablePaymentMethods.length || stripePromise)
                      ? "pointer"
                      : "not-allowed",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    Payment method
                  </span>
                  <span>
                    {formatSelectedPaymentMethodLabel(selectedPaymentMethod)}
                  </span>
                </button>
                {bulkPaymentMethodMenuOpen && executablePaymentMethods.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      minWidth: "100%",
                      zIndex: 20,
                      background: "#fff",
                      borderRadius: 18,
                      border: "1px solid rgba(15,23,42,0.10)",
                      boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
                      overflow: "hidden",
                    }}
                  >
                    {executablePaymentMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => {
                          setBulkPaymentMethodId(method.id);
                          setBulkPaymentMethodMenuOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background:
                            method.id === selectedPaymentMethodId
                              ? "rgba(15,118,110,0.08)"
                              : "#fff",
                          border: 0,
                          padding: "12px 14px",
                          cursor: "pointer",
                          borderBottom: "1px solid rgba(15,23,42,0.06)",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {formatSelectedPaymentMethodLabel(method)}
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b" }}>
                          {method.isDefault ? "Default" : "Saved payment method"}
                        </div>
                      </button>
                    ))}
                    {stripePromise && (
                      <button
                        type="button"
                        onClick={() => {
                          setBulkPaymentMethodMenuOpen(false);
                          startPaymentMethodSetup("card");
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "#fff",
                          border: 0,
                          padding: "12px 14px",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f766e" }}>
                          Add new card with Stripe
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b" }}>
                          Open Stripe payment selector
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
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
                  : `Pay selected (${selectedBillIds.length}) • ${formatCurrency(selectedTotalAmount)}`}
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

            <div style={{ marginTop: 20, display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

              {/* ── Category sidebar ───────────────────────────── */}
              <nav
                style={{
                  flexShrink: 0,
                  width: 210,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  position: "sticky",
                  top: 80,
                }}
              >
                {/* "All" item */}
                {[{ id: "all", label: "All bills", icon: "📋" }, ...BILL_CATEGORIES].map((cat) => {
                  const count =
                    cat.id === "all"
                      ? bills.length
                      : bills.filter((b) => b.category === cat.id).length;
                  const total =
                    cat.id === "all"
                      ? bills.reduce((s, b) => s + (parseFloat(b.amountDue) || 0), 0)
                      : bills
                          .filter((b) => b.category === cat.id)
                          .reduce((s, b) => s + (parseFloat(b.amountDue) || 0), 0);
                  const isActive = categoryFilter === cat.id;

                  // Per-category accent colors
                  const COLOR_MAP = {
                    all:           { bg: "rgba(15,23,42,0.06)",   activeBg: "#0f172a",        text: "#0f172a", activeText: "#fff" },
                    utilities:     { bg: "rgba(234,179,8,0.10)",  activeBg: "#ca8a04",        text: "#854d0e", activeText: "#fff" },
                    credit_card:   { bg: "rgba(99,102,241,0.10)", activeBg: "#4f46e5",        text: "#3730a3", activeText: "#fff" },
                    equipment:     { bg: "rgba(14,165,233,0.10)", activeBg: "#0284c7",        text: "#0369a1", activeText: "#fff" },
                    vehicle:       { bg: "rgba(16,185,129,0.10)", activeBg: "#059669",        text: "#065f46", activeText: "#fff" },
                    insurance:     { bg: "rgba(239,68,68,0.09)",  activeBg: "#dc2626",        text: "#991b1b", activeText: "#fff" },
                    rent:          { bg: "rgba(168,85,247,0.10)", activeBg: "#7c3aed",        text: "#5b21b6", activeText: "#fff" },
                    payroll:       { bg: "rgba(251,146,60,0.12)", activeBg: "#ea580c",        text: "#9a3412", activeText: "#fff" },
                    materials:     { bg: "rgba(120,113,108,0.10)",activeBg: "#57534e",        text: "#44403c", activeText: "#fff" },
                    internet:      { bg: "rgba(6,182,212,0.10)",  activeBg: "#0891b2",        text: "#0e7490", activeText: "#fff" },
                    subscriptions: { bg: "rgba(236,72,153,0.10)", activeBg: "#db2777",        text: "#9d174d", activeText: "#fff" },
                    general:       { bg: "rgba(100,116,139,0.10)",activeBg: "#475569",        text: "#334155", activeText: "#fff" },
                  };
                  const c = COLOR_MAP[cat.id] || COLOR_MAP.general;
                  if (!isActive && count === 0) return null;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        borderRadius: 14,
                        border: "none",
                        background: isActive ? c.activeBg : c.bg,
                        color: isActive ? c.activeText : c.text,
                        padding: "10px 14px",
                        fontWeight: isActive ? 700 : 500,
                        fontSize: 13,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.12s",
                        width: "100%",
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }}>{cat.icon}</span>
                      <span style={{ flex: 1 }}>{cat.label}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: isActive ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.08)",
                          color: isActive ? "#fff" : c.text,
                          borderRadius: 999,
                          padding: "2px 7px",
                          minWidth: 22,
                          textAlign: "center",
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </nav>

              {/* ── Main bill list ─────────────────────────────── */}
              <div style={{ flex: 1, display: "grid", gap: 14 }}>
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
                                            : bill.status === "due_soon"
                                              ? "rgba(245,158,11,0.18)"
                                              : bill.status === "processing"
                                                ? "rgba(245,158,11,0.14)"
                                                : bill.status === "upcoming"
                                                  ? "rgba(14,165,233,0.10)"
                                                  : "rgba(15,23,42,0.08)",
                                      color:
                                        bill.status === "paid"
                                          ? "#065f46"
                                          : bill.status === "overdue"
                                            ? "#991b1b"
                                            : bill.status === "due_soon"
                                              ? "#b45309"
                                              : bill.status === "processing"
                                                ? "#92400e"
                                                : bill.status === "upcoming"
                                                  ? "#0369a1"
                                                  : "#334155",
                                      fontWeight: 700,
                                      fontSize: 12,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.08em",
                                    }}
                                  >
                                    {bill.status === "due_soon" ? "⚠ Due Soon"
                                      : bill.status === "upcoming" ? "🟢 Upcoming"
                                      : bill.status === "overdue" ? "🔴 Overdue"
                                      : bill.status === "paid" ? "✅ Paid"
                                      : bill.status}
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
                                  {/* Category badge */}
                                  {(() => {
                                    const cat = BILL_CATEGORIES.find((c) => c.id === bill.category);
                                    return cat && cat.id !== "general" ? (
                                      <span
                                        style={{
                                          padding: "4px 10px",
                                          borderRadius: 999,
                                          background: "rgba(99,102,241,0.10)",
                                          color: "#4338ca",
                                          fontSize: 12,
                                          fontWeight: 600,
                                        }}
                                      >
                                        {cat.icon} {cat.label}
                                      </span>
                                    ) : null;
                                  })()}
                                  {/* Recurring badge */}
                                  {bill.isRecurring && (
                                    <span
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        background: "rgba(16,185,129,0.10)",
                                        color: "#047857",
                                        fontSize: 12,
                                        fontWeight: 600,
                                      }}
                                    >
                                      🔁 {bill.frequency || "recurring"}
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
                                      Min {formatCurrency(
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
                              {bill.status !== "paid" &&
                                bill.status !== "processing" && (
                                  <button
                                    type="button"
                                    onClick={() => payBillNow(bill.id)}
                                    disabled={
                                      !canManageSensitiveData ||
                                      paying ||
                                      !selectedPaymentMethodId
                                    }
                                    style={{
                                      borderRadius: 999,
                                      border: "1px solid rgba(15,118,110,0.32)",
                                      background: "rgba(15,118,110,0.08)",
                                      color: "#0f766e",
                                      padding: "10px 14px",
                                      fontWeight: 700,
                                      cursor:
                                        canManageSensitiveData &&
                                        !paying &&
                                        selectedPaymentMethodId
                                          ? "pointer"
                                          : "not-allowed",
                                    }}
                                  >
                                    Pay now
                                  </button>
                                )}
                              <button
                                type="button"
                                onClick={() => selectBillForEdit(bill)}
                                style={{
                                  borderRadius: 999,
                                  border: "1px solid rgba(15,23,42,0.14)",
                                  background: "#fff",
                                  color: "#0f172a",
                                  padding: "6px 10px",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  cursor: "pointer",
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                                </svg>
                                Edit
                              </button>
                              {bill.status !== "paid" && (
                                <button
                                  type="button"
                                  onClick={() => markAsPaid(bill.id)}
                                  style={{
                                    borderRadius: 999,
                                    border: "1px solid rgba(16,185,129,0.3)",
                                    background: "rgba(16,185,129,0.08)",
                                    color: "#047857",
                                    padding: "10px 14px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  ✓ Mark as Paid
                                </button>
                              )}
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
                                  padding: "6px 10px",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  cursor: "pointer",
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6l-1 14H6L5 6" />
                                  <path d="M10 11v6" />
                                  <path d="M14 11v6" />
                                </svg>
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
              </div>{/* end main bill list */}
            </div>{/* end sidebar+list flex wrapper */}
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
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(15,23,42,0.04)",
                  color: "#475569",
                  fontSize: 13,
                }}
              >
                {categoryFieldHints.selectedCategory?.icon} {categoryFieldHints.selectedCategory?.label}: {categoryFieldHints.helper}
              </div>
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <div
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setProviderPickerOpen(false);
                    }
                  }}
                  style={{ position: "relative" }}
                >
                  <input
                    value={providerQuery}
                    onChange={(event) => {
                      setProviderQuery(event.target.value);
                      setProviderPickerOpen(event.target.value.trim().length >= 2);
                      setBillFormErrors((current) => ({
                        ...current,
                        providerName: "",
                      }));
                      setBillForm((current) => ({
                        ...current,
                        providerName: event.target.value,
                        providerId: "",
                      }));
                    }}
                    onFocus={() => {
                      if (providerQuery.trim().length >= 2) {
                        setProviderPickerOpen(true);
                      }
                    }}
                    placeholder={categoryFieldHints.providerPlaceholder}
                    style={{
                      width: "100%",
                      borderRadius: 16,
                      border: "1px solid rgba(15,23,42,0.12)",
                      padding: "14px 16px",
                    }}
                  />
                  {providerPickerOpen &&
                    providerQuery.trim().length >= 2 &&
                    providers.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        right: 0,
                        zIndex: 20,
                        maxHeight: 280,
                        overflowY: "auto",
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
                            setProviderPickerOpen(false);
                            setBillFormErrors((current) => ({
                              ...current,
                              providerName: "",
                            }));
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
                  onChange={handleAccountLabelChange}
                  placeholder={categoryFieldHints.accountLabelPlaceholder}
                  style={{
                    borderRadius: 16,
                    border: billFormErrors.accountLabel
                      ? "1px solid #dc2626"
                      : "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                  }}
                />
                {billFormErrors.accountLabel && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: -4 }}>
                    {billFormErrors.accountLabel}
                  </div>
                )}
                <input
                  value={billForm.accountNumber}
                  onChange={handleAccountNumberChange}
                  aria-invalid={accountNumberError ? "true" : "false"}
                  inputMode="numeric"
                  placeholder="Account or member number"
                  style={{
                    borderRadius: 16,
                    border: accountNumberError
                      ? "1px solid #dc2626"
                      : "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                  }}
                />
                {accountNumberError && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: -4 }}>
                    {accountNumberError}
                  </div>
                )}
                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <input
                    value={billForm.amountDue}
                    onChange={handleAmountDueChange}
                    placeholder="Amount due"
                    type="number"
                    min="0"
                    step="0.01"
                    style={{
                      borderRadius: 16,
                      border: billFormErrors.amountDue
                        ? "1px solid #dc2626"
                        : "1px solid rgba(15,23,42,0.12)",
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
                      border: CATEGORIES_WITH_MIN_PAYMENT.has(billForm.category)
                        ? "1.5px solid rgba(99,102,241,0.45)"
                        : "1px solid rgba(15,23,42,0.12)",
                      padding: "14px 16px",
                      background: CATEGORIES_WITH_MIN_PAYMENT.has(billForm.category)
                        ? "rgba(99,102,241,0.04)"
                        : undefined,
                    }}
                  />
                </div>
                {CATEGORIES_WITH_MIN_PAYMENT.has(billForm.category) && (
                  <div style={{ fontSize: 12, color: "#6366f1", marginTop: -6 }}>
                    Tip: enter the minimum payment required for this {billForm.category === "credit_card" ? "credit card" : "account"}.
                  </div>
                )}
                <input
                  value={billForm.dueDate}
                  onChange={handleDueDateChange}
                  type="date"
                  style={{
                    borderRadius: 16,
                    border: billFormErrors.dueDate
                      ? "1px solid #dc2626"
                      : "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                  }}
                />
                {(billFormErrors.amountDue || billFormErrors.dueDate) && (
                  <div style={{ display: "grid", gap: 4, marginTop: -4 }}>
                    {billFormErrors.amountDue && (
                      <div style={{ color: "#b91c1c", fontSize: 13 }}>
                        {billFormErrors.amountDue}
                      </div>
                    )}
                    {billFormErrors.dueDate && (
                      <div style={{ color: "#b91c1c", fontSize: 13 }}>
                        {billFormErrors.dueDate}
                      </div>
                    )}
                  </div>
                )}
                {/* Category selector */}
                <select
                  value={billForm.category}
                  onChange={(event) => {
                    const cat = BILL_CATEGORIES.find((c) => c.id === event.target.value);
                    setBillForm((current) => ({
                      ...current,
                      category: event.target.value,
                      tags: cat?.defaultTags.length
                        ? cat.defaultTags.join(", ")
                        : current.tags,
                    }));
                  }}
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.12)",
                    padding: "14px 16px",
                    background: "#fff",
                  }}
                >
                  {BILL_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
                {/* Recurring toggle */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 16px",
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: billForm.isRecurring ? "rgba(16,185,129,0.05)" : "#fafafa",
                  }}
                >
                  <input
                    id="recurring-toggle"
                    type="checkbox"
                    checked={billForm.isRecurring}
                    onChange={(event) =>
                      setBillForm((current) => ({
                        ...current,
                        isRecurring: event.target.checked,
                      }))
                    }
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <label htmlFor="recurring-toggle" style={{ fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#0f172a" }}>
                    🔁 Recurring bill
                  </label>
                  {billForm.isRecurring && (
                    <select
                      value={billForm.frequency}
                      onChange={(event) =>
                        setBillForm((current) => ({
                          ...current,
                          frequency: event.target.value,
                        }))
                      }
                      style={{
                        marginLeft: "auto",
                        borderRadius: 999,
                        border: "1px solid rgba(15,23,42,0.12)",
                        padding: "6px 12px",
                        fontSize: 13,
                      }}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  )}
                </div>
                <input
                  value={billForm.tags}
                  onChange={(event) =>
                    setBillForm((current) => ({
                      ...current,
                      tags: event.target.value,
                    }))
                  }
                  placeholder="Tags (comma-separated)"
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
                  rows={3}
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
                        billingDetails={{
                          name: authUser?.name || authUser?.fullName || authUser?.email || "",
                          email: authUser?.email || "",
                        }}
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
                        onSaved={async (method) => {
                          setSetupIntentState({
                            active: false,
                            clientSecret: "",
                            methodType: "card",
                          });
                          setBulkPaymentMethodId(method.id || "");
                          setBulkPaymentMethodMenuOpen(false);
                          setNotice(
                            method
                              ? `Selected ${formatSelectedPaymentMethodLabel(method)}.`
                              : "Payment method saved.",
                          );
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
