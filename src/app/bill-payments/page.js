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
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import PaymentMethodsHub from "@/components/payments/PaymentMethodsHub";
import BillPaymentsSecureShell from "@/components/bill-payments/BillPaymentsSecureShell";
import {
  BILL_PAY_CATEGORIES,
  CATEGORIES_WITH_MIN_PAYMENT,
} from "@/lib/bill-payments-catalog";
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

const BILL_CATEGORIES = BILL_PAY_CATEGORIES;

const initialBillForm = {
  providerId: "",
  providerName: "",
  accountLabel: "",
  accountNumber: "",
  providerIdentifiers: {},
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

function normalizeIdentifierKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

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

  const submit = useCallback(async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSaving(true);
    onError("");

    let result;
    try {
      result = await Promise.race([
        stripe.confirmSetup({
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
        }),
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error("Stripe is taking too long. Please try again."));
          }, 30000);
        }),
      ]);
    } catch (error) {
      onError(error.message || "Unable to save payment method.");
      setSaving(false);
      return;
    }

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
          timeoutMs: 30000,
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
  }, [billingDetails?.email, billingDetails?.name, elements, onError, onSaved, setSaving, stripe]);

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
            fields: { billingDetails: "auto" },
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
  const searchParams = useSearchParams();
  const activeHubTab =
    searchParams.get("tab") === "wallet" ? "wallet" : "bills";
  const goToHubTab = useCallback(
    (tab) => {
      router.replace(
        tab === "wallet" ? "/bill-payments?tab=wallet" : "/bill-payments",
      );
    },
    [router],
  );
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
    pricing: {
      monthlyFeeUsd: 9.99,
      cardFeePercent: 5.9,
      bankAccountFeePercent: 3.0,
    },
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
  const [remittanceRefs, setRemittanceRefs] = useState({});
  const [submittingRemittance, setSubmittingRemittance] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [billDrawerOpen, setBillDrawerOpen] = useState(false);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionGateDetails, setSubscriptionGateDetails] = useState(null);
  const [monthlyBillsEstimate, setMonthlyBillsEstimate] = useState("4");
  const deferredProviderQuery = useDeferredValue(providerQuery);
  const deferredFilterQuery = useDeferredValue(filterQuery);
  const routeBillId =
    typeof params?.id === "string" && params.id ? params.id : "";

  const canManageSensitiveData = capabilities.canManageSensitiveData;
  const paymentBrandName = "FieldBase";
  const paymentBillingName = useMemo(() => {
    const companyCandidate = String(
      authUser?.companyName || authUser?.businessName || "",
    ).trim();
    if (companyCandidate) return companyCandidate;
    return paymentBrandName;
  }, [authUser]);
  const bills = dashboard.bills || [];
  const recentTransactions = dashboard.recentTransactions || [];
  const pricingConfig =
    dashboard.pricing && typeof dashboard.pricing === "object"
      ? dashboard.pricing
      : {
          monthlyFeeUsd: 5,
          cardFeePercent: 5.9,
          bankAccountFeePercent: 3.0,
        };
  const isSubscriptionRequiredError =
    typeof error === "string" &&
    error.toLowerCase().includes("subscription required");
  const subscriptionSubscribeUrl =
    String(subscriptionGateDetails?.subscribeUrl || "").trim() ||
    "/subscriptions?source=bill-payments";
  const billPaymentsSubscribeUrl = "/subscriptions?source=bill-payments";
  const upgradeEstimate = useMemo(() => {
    const billsPerMonth = Math.max(1, Math.min(100, Number(monthlyBillsEstimate || 0) || 4));
    const monthlyFee = Number(pricingConfig.monthlyFeeUsd || 0);
    const costPerBill = monthlyFee / billsPerMonth;
    const minutesSaved = billsPerMonth * 8;
    const hourlyValue = 30;
    const timeValue = (minutesSaved / 60) * hourlyValue;
    const netValue = timeValue - monthlyFee;
    return {
      billsPerMonth,
      monthlyFee,
      costPerBill,
      minutesSaved,
      timeValue,
      netValue,
    };
  }, [monthlyBillsEstimate, pricingConfig.monthlyFeeUsd]);
  const executablePaymentMethods = useMemo(
    () =>
      paymentMethods.filter(
        (method) =>
          !["failed", "blocked", "inactive"].includes(
            String(method.status || "").toLowerCase(),
          ),
      ),
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
  const selectedProvider = useMemo(
    () =>
      providers.find((provider) => provider.id === billForm.providerId) ||
      providers.find(
        (provider) =>
          String(provider.providerName || "").trim().toLowerCase() ===
          String(billForm.providerName || "").trim().toLowerCase(),
      ) ||
      null,
    [providers, billForm.providerId, billForm.providerName],
  );
  const requiredProviderFields = useMemo(
    () =>
      Array.isArray(selectedProvider?.requiredFields)
        ? selectedProvider.requiredFields
        : [],
    [selectedProvider],
  );

  function handleActionError(actionError, fallbackMessage) {
    const message = actionError?.message || fallbackMessage;
    setError(message);

    const subscriptionError =
      String(actionError?.code || "") === "bill_payments_subscription_required" ||
      /subscription required|free bill limit/i.test(String(message || ""));

    if (!subscriptionError) {
      setSubscriptionGateDetails(null);
      return;
    }

    setSubscriptionGateDetails({
      subscribeUrl: String(actionError?.subscribeUrl || "").trim(),
      freeBillsLimit: Number(actionError?.details?.freeBillsLimit || 0) || null,
      currentBills: Number(actionError?.details?.currentBills || 0) || null,
    });
    setShowSubscriptionModal(true);
  }

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

    for (const field of requiredProviderFields) {
      if (!field?.required) continue;
      const key = normalizeIdentifierKey(field.key);
      if (!key || key === "account_number") continue;
      const value = String(currentForm.providerIdentifiers?.[key] || "").trim();
      if (!value) {
        nextErrors[`providerIdentifiers.${key}`] =
          `${field.label || key} is required`;
      }
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

  function handleProviderIdentifierChange(key, value) {
    setBillForm((current) => ({
      ...current,
      providerIdentifiers: {
        ...(current.providerIdentifiers || {}),
        [key]: value,
      },
    }));
    setBillFormErrors((current) => ({
      ...current,
      [`providerIdentifiers.${key}`]: "",
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

  const selectedPaymentBreakdown = useMemo(() => {
    const subtotal = selectedTotalAmount;
    const methodType = String(selectedPaymentMethod?.methodType || "").trim();
    const feePercent =
      methodType === "bank_account"
        ? Number(pricingConfig.bankAccountFeePercent || 0)
        : Number(pricingConfig.cardFeePercent || 0);
    const fee = Number((subtotal * (feePercent / 100)).toFixed(2));
    const total = Number((subtotal + fee).toFixed(2));
    return { subtotal, feePercent, fee, total };
  }, [pricingConfig, selectedPaymentMethod?.methodType, selectedTotalAmount]);

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

  const loadProviders = useCallback(async (query = "", category = "") => {
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category && category !== "all") params.set("category", category);
      const qs = params.toString();
      const response = await apiFetch(
        `/api/bill-payments/providers${qs ? `?${qs}` : ""}`,
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
      providerIdentifiers: bill.providerIdentifiers || {},
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
            providerIdentifiers: billForm.providerIdentifiers || {},
          }),
        },
      );
      await getJsonOrThrow(response, "Unable to save bill.");
      setNotice(editingBillId ? "Bill updated." : "Bill added.");
      resetBillForm();
      await loadDashboard();
    } catch (saveError) {
      handleActionError(saveError, "Unable to save bill.");
    } finally {
      setSavingBill(false);
    }
  }

  function openPaymentMethodSelector() {
    if (!executablePaymentMethods.length) {
      goToHubTab("wallet");
      setNotice("Add a card or bank account in the Wallet tab.");
      return;
    }
    if (!executablePaymentMethods.length && !stripePromise) {
      setShowPaymentMethods(true);
      setError(
        "Payment setup is unavailable. Configure Stripe publishable key or link a bank via Plaid.",
      );
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
    setShowPaymentMethods(true);
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
      handleActionError(setupError, "Unable to prepare payment method setup.");
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
      handleActionError(methodError, "Unable to update payment method.");
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
      handleActionError(methodError, "Unable to remove payment method.");
    }
  }

  async function launchPlaidLink(existingMethod = null) {
    if (plaidLaunching) {
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
      handleActionError(plaidError, "Unable to link bank account with Plaid.");
    } finally {
      setPlaidLaunching(false);
    }
  }

  async function paySelectedBills(billIds = selectedBillIds) {
    if (!billIds.length) {
      setError("Select at least one bill to pay.");
      return;
    }

    if (!selectedPaymentMethodId) {
      setShowPaymentMethods(true);
      setError("Choose or add a payment method before paying.");
      return;
    }

    const payAmount = bills
      .filter((bill) => billIds.includes(bill.id))
      .reduce((sum, bill) => sum + Number(bill.amountDue || 0), 0);
    const methodType = String(selectedPaymentMethod?.methodType || "").trim();
    const feePercent =
      methodType === "bank_account"
        ? Number(pricingConfig.bankAccountFeePercent || 0)
        : Number(pricingConfig.cardFeePercent || 0);
    const feeAmount = Number((payAmount * (feePercent / 100)).toFixed(2));
    const totalAmount = Number((payAmount + feeAmount).toFixed(2));
    const confirmed = window.confirm(
      `Pay ${billIds.length} bill${billIds.length === 1 ? "" : "s"}?\nSubtotal: ${formatCurrency(payAmount)}\nTransaction fee (${feePercent.toFixed(2)}%): ${formatCurrency(feeAmount)}\nTotal charge: ${formatCurrency(totalAmount)}`,
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
          : `Submitted ${payload.data.transactions.length} bill payment${payload.data.transactions.length === 1 ? "" : "s"}. Charged ${formatCurrency(payload?.data?.summary?.totalCharged || 0)} (fees ${formatCurrency(payload?.data?.summary?.totalFees || 0)}).`,
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

  async function submitRemittance(transactionId) {
    const ref = String(remittanceRefs[transactionId] || "").trim();
    setSubmittingRemittance(transactionId);
    try {
      const response = await apiFetch(
        `/api/bill-payments/remittance/${transactionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remittanceReference: ref, remittanceStatus: "submitted" }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to submit remittance");
      }
      setDashboard((prev) => ({
        ...prev,
        recentTransactions: (prev.recentTransactions || []).map((tx) =>
          tx.id === transactionId
            ? { ...tx, remittanceStatus: "submitted", remittanceReference: ref }
            : tx,
        ),
      }));
      setRemittanceRefs((prev) => { const next = { ...prev }; delete next[transactionId]; return next; });
    } catch (e) {
      setError(e.message || "Failed to submit remittance");
    } finally {
      setSubmittingRemittance(null);
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
          <BillPaymentsSecureShell
            activeTab={activeHubTab}
            onTabChange={goToHubTab}
            activeCategory={categoryFilter}
            onCategoryPick={(categoryId) => {
              setCategoryFilter(categoryId);
              loadProviders(providerQuery, categoryId);
            }}
          />

          {activeHubTab === "wallet" ? (
            <PaymentMethodsHub
              billingName={paymentBillingName}
              billingEmail={authUser?.email || ""}
              brandName={paymentBrandName}
              showBillPaymentsLink={false}
              onGoToBills={() => goToHubTab("bills")}
              onMethodsChange={(list) => setPaymentMethods(list)}
            />
          ) : (
            <>
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
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 15 }}>
                    View, select, and pay bills fast.
                  </p>
                  {!authUser?.isSubscribed && bills.length > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        borderRadius: 999,
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        background: bills.length >= 2
                          ? "rgba(239, 68, 68, 0.12)"
                          : "rgba(34, 197, 94, 0.12)",
                        color: bills.length >= 2 ? "#dc2626" : "#16a34a",
                      }}
                    >
                      {bills.length >= 2
                        ? "2/2 free bills used - subscribe to add more"
                        : `${bills.length}/2 free bills used`}
                    </span>
                  )}
                </div>
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
              <button
                type="button"
                onClick={() => router.push("/bill-payments/processing-center")}
                style={{
                  border: "1px solid rgba(14,165,233,0.34)",
                  borderRadius: 999,
                  background: "rgba(14,165,233,0.12)",
                  color: "#0c4a6e",
                  padding: "11px 17px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Open Processing Center
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
                  disabled={false}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "#fff",
                    color: "#0f172a",
                    padding: "10px 11px",
                    fontWeight: 600,
                    cursor: "pointer",
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
                  !selectedBillIds.length ||
                  paying
                }
                style={{
                  border: 0,
                  borderRadius: 999,
                  background: !selectedPaymentMethodId
                    ? "#64748b"
                    : "linear-gradient(135deg, #0f766e, #0b5f5a)",
                  color: "#fff",
                  padding: "11px 16px",
                  fontWeight: 700,
                  cursor: !selectedBillIds.length || paying ? "not-allowed" : "pointer",
                  boxShadow: selectedPaymentMethodId
                    ? "0 10px 20px rgba(15,118,110,0.24)"
                    : "none",
                }}
              >
                {paying
                  ? "Submitting..."
                  : `Pay Selected (${selectedBillIds.length}) - ${formatCurrency(selectedPaymentBreakdown.total)} total (${formatCurrency(selectedPaymentBreakdown.fee)} fee)`}
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
                <div>{error || notice}</div>
                {isSubscriptionRequiredError ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => router.push(billPaymentsSubscribeUrl)}
                      style={{
                        border: 0,
                        borderRadius: 999,
                        background: "linear-gradient(135deg, #0f766e, #0b5f5a)",
                        color: "#fff",
                        padding: "9px 14px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Subscribe now
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubscriptionModal(true);
                      }}
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(15,23,42,0.16)",
                        background: "#fff",
                        color: "#0f172a",
                        padding: "9px 14px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Why subscribe?
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {!authUser?.isSubscribed && bills.length >= 2 && (
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(239,68,68,0.24)",
                    background: "rgba(239,68,68,0.08)",
                    color: "#991b1b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      All free bills used (2/2)
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
                      Subscribe to add more bills and keep your business organized.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(subscriptionSubscribeUrl)}
                    style={{
                      border: 0,
                      borderRadius: 8,
                      background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                      color: "#fff",
                      padding: "8px 14px",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 13,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Subscribe now
                  </button>
                </div>
              )}
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
                                  borderRadius: 999,
                                  background: statusTone.bg,
                                  color: statusTone.color,
                                  padding: compactMode ? "2px 8px" : "3px 9px",
                                  fontSize: compactMode ? 10 : 11,
                                  fontWeight: 700,
                                  letterSpacing: "0.05em",
                                  textTransform: "uppercase",
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
                              disabled={paying}
                              style={{
                                borderRadius: 999,
                                border: "1px solid rgba(15,118,110,0.28)",
                                background: !selectedPaymentMethodId
                                  ? "#f8fafc"
                                  : "rgba(15,118,110,0.08)",
                                color: !selectedPaymentMethodId
                                  ? "#0f172a"
                                  : "#0f766e",
                                padding: compactMode ? "6px 10px" : "8px 12px",
                                fontWeight: 700,
                                cursor: paying ? "not-allowed" : "pointer",
                              }}
                            >
                              Pay now
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => selectBillForEdit(bill, { navigate: false })}
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
              padding: 16,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>
                Wallet
              </div>
              <div style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
                {paymentMethods.length === 0
                  ? "Add a card or bank account to pay bills."
                  : `${paymentMethods.length} saved method${paymentMethods.length === 1 ? "" : "s"} ready to use.`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => goToHubTab("wallet")}
              style={{
                border: 0,
                borderRadius: 999,
                background: "linear-gradient(135deg, #0f766e, #14b8a6)",
                color: "#fff",
                padding: "10px 18px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Manage cards & banks
            </button>
          </section>

            </>
          )}
        </div>

        {activeHubTab === "bills" && billDrawerOpen && (
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
                    const query = event.target.value;
                    setBillForm((current) => ({
                      ...current,
                      providerName: query,
                      providerId: "",
                    }));
                    setProviderQuery(query);
                    setProviderPickerOpen(query.trim().length >= 2);
                    setBillFormErrors((current) => ({ ...current, providerName: "" }));
                  }}
                  onFocus={() => {
                    if (providerQuery.trim().length >= 2) {
                      setProviderPickerOpen(true);
                    }
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
                {providerPickerOpen && providers.length > 0 && (
                  <div
                    style={{
                      border: "1px solid rgba(15,23,42,0.12)",
                      borderRadius: 12,
                      background: "#fff",
                      maxHeight: 210,
                      overflowY: "auto",
                      marginTop: -2,
                    }}
                  >
                    {providers.slice(0, 10).map((provider) => (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => {
                          setBillForm((current) => ({
                            ...current,
                            providerId: provider.id,
                            providerName: provider.providerName,
                            category: provider.category || current.category,
                          }));
                          setProviderQuery(provider.providerName || "");
                          setProviderPickerOpen(false);
                          setBillFormErrors((current) => ({
                            ...current,
                            providerName: "",
                          }));
                        }}
                        style={{
                          width: "100%",
                          border: 0,
                          background: "#fff",
                          textAlign: "left",
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid rgba(15,23,42,0.06)",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {provider.providerName}
                        </div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>
                          {(provider.category || "general").replace(/_/g, " ")}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {billFormErrors.providerName && (
                  <div style={{ color: "#b91c1c", fontSize: 13, marginTop: -2 }}>
                    {billFormErrors.providerName}
                  </div>
                )}

                {selectedProvider?.settlementSupport && (
                  <div
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(14,116,144,0.22)",
                      background: "rgba(14,116,144,0.08)",
                      color: "#0c4a6e",
                      padding: "8px 10px",
                      fontSize: 12,
                    }}
                  >
                    Remittance: {selectedProvider.remittanceChannel || "manual_portal"} Â· Support: {selectedProvider.settlementSupport}
                    {selectedProvider.remittanceNotes ? ` Â· ${selectedProvider.remittanceNotes}` : ""}
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

                {requiredProviderFields
                  .filter((field) => normalizeIdentifierKey(field.key) !== "account_number")
                  .map((field) => {
                    const key = normalizeIdentifierKey(field.key);
                    const fieldError = billFormErrors[`providerIdentifiers.${key}`] || "";
                    return (
                      <div key={key} style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>
                          {field.label || key}
                          {field.required ? " *" : ""}
                        </label>
                        <input
                          value={billForm.providerIdentifiers?.[key] || ""}
                          onChange={(event) =>
                            handleProviderIdentifierChange(key, event.target.value)
                          }
                          placeholder={field.hint || field.label || key}
                          style={{
                            borderRadius: 12,
                            border: fieldError
                              ? "1px solid #dc2626"
                              : "1px solid rgba(15,23,42,0.12)",
                            padding: "12px 14px",
                          }}
                        />
                        {fieldError && (
                          <div style={{ color: "#b91c1c", fontSize: 12 }}>
                            {fieldError}
                          </div>
                        )}
                      </div>
                    );
                  })}

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
