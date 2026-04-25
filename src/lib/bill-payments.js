import "server-only";

import crypto from "node:crypto";
import { getStripeServerClient } from "@/lib/stripe-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  logSupabaseError,
  normalizeDateOnly,
  normalizeUuid,
} from "@/lib/supabase-db";
import {
  canManageSensitive,
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getPlaidProcessorToken } from "@/lib/plaid-integration";
import { attachPlaidBankAccountToStripeCustomer } from "@/lib/stripe-payments";

export const BILL_TABLE = "bills";
export const BILL_PROVIDER_TABLE = "bill_providers";
export const BILL_PAYMENT_METHOD_TABLE = "bill_payment_methods";
export const BILL_PAYMENT_CUSTOMER_TABLE = "bill_payment_customers";
export const BILL_PAYMENT_TRANSACTION_TABLE = "bill_payment_transactions";
export const BILL_AUTOPAY_RULE_TABLE = "bill_autopay_rules";
export const NOTIFICATIONS_TABLE = "notifications";

export const BILL_STATUSES = new Set([
  "upcoming",
  "open",
  "due_soon",
  "overdue",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);

export const BILL_CATEGORIES = [
  { id: "utilities",      label: "Utilities",              icon: "⚡", defaultTags: ["utility"] },
  { id: "credit_card",   label: "Credit Cards",            icon: "💳", defaultTags: ["credit"] },
  { id: "equipment",     label: "Equipment Financing",     icon: "🛠️", defaultTags: ["equipment"] },
  { id: "vehicle",       label: "Truck / Vehicle",         icon: "🚛", defaultTags: ["vehicle", "fleet"] },
  { id: "insurance",     label: "Insurance",               icon: "🛡️", defaultTags: ["insurance"] },
  { id: "rent",          label: "Rent / Yard / Storage",   icon: "🏢", defaultTags: ["rent"] },
  { id: "payroll",       label: "Payroll / Subs",          icon: "👷", defaultTags: ["payroll"] },
  { id: "materials",     label: "Materials / Suppliers",   icon: "🧱", defaultTags: ["materials"] },
  { id: "internet",      label: "Internet / Phone",        icon: "📡", defaultTags: ["internet"] },
  { id: "subscriptions", label: "Subscriptions",           icon: "📦", defaultTags: ["subscription"] },
  { id: "general",       label: "General",                 icon: "📄", defaultTags: [] },
];

export const BILL_FREQUENCIES = ["weekly", "monthly", "yearly"];

export const AUTOPAY_RULE_TYPES = new Set([
  "full_balance",
  "fixed_amount",
  "minimum_amount",
]);

export const AUTOPAY_SCHEDULE_TYPES = new Set([
  "due_date",
  "days_before_due",
  "monthly_date",
]);

export async function requireBillPaymentsAccess(request, mode = "read") {
  const context = await getAuthenticatedTenantContext(request);
  if (!context.authenticated) {
    return { response: unauthenticatedResponse() };
  }

  if (mode === "write" && !canWrite(context.role)) {
    return { response: forbiddenResponse() };
  }

  if (mode === "sensitive" && !canManageSensitive(context.role)) {
    return { response: forbiddenResponse() };
  }

  return { context };
}

export function normalizeMoneyAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

export function normalizeTagList(values = []) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  for (const value of values) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .slice(0, 40);
    if (!normalized) continue;
    unique.add(normalized);
  }
  return [...unique];
}

export function hashAccountReference(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function maskAccountReference(value) {
  const raw = String(value || "")
    .replace(/\s+/g, "")
    .trim();
  if (!raw) return "";
  const last4 = raw.slice(-4);
  return `${"•".repeat(Math.max(raw.length - 4, 4))}${last4}`;
}

function normalizeText(value, maxLength = 200) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeStatus(value, allowed, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

export function serializeBillProvider(row) {
  return {
    id: row.id,
    providerName: row.provider_name || "",
    category: row.category || "general",
    websiteUrl: row.website_url || "",
    supportPhone: row.support_phone || "",
    searchTerms: Array.isArray(row.search_terms) ? row.search_terms : [],
  };
}

export function serializeBill(row, autopayRule = null) {
  const dueDate = normalizeDateOnly(row.due_date) || row.due_date || null;
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    providerId: row.provider_id || "",
    providerName: row.provider_name || "",
    accountLabel: row.account_label || "",
    accountReferenceMasked: row.account_reference_masked || "",
    amountDue: Number(row.amount_due || 0),
    minimumAmount:
      row.minimum_amount == null ? null : Number(row.minimum_amount || 0),
    currency: row.currency || "usd",
    dueDate,
    scheduleAnchorDate:
      normalizeDateOnly(row.schedule_anchor_date) ||
      row.schedule_anchor_date ||
      null,
    status: row.status || "open",
    source: row.source || "manual",
    tags: Array.isArray(row.tags) ? row.tags : [],
    notes: row.notes || "",
    autopayEnabled: row.autopay_enabled === true,
    lastPaidAt: row.last_paid_at || null,
    lastPaymentId: row.last_payment_id || "",
    category: row.category || "general",
    isRecurring: row.is_recurring === true,
    frequency: row.frequency || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    autopayRule: autopayRule ? serializeAutopayRule(autopayRule) : null,
  };
}

export function serializeBillPaymentMethod(row) {
  const metadata = row.metadata && typeof row.metadata === "object"
    ? row.metadata
    : {};
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    methodType: row.method_type || "card",
    methodLabel: row.method_label || "",
    brand: row.brand || "",
    bankName: row.bank_name || "",
    last4: row.last4 || "",
    expMonth: row.exp_month || null,
    expYear: row.exp_year || null,
    isDefault: row.is_default === true,
    allowAutopay: row.allow_autopay !== false,
    status: row.status || "active",
    provider: metadata.provider || "stripe",
    reconnectRequired: metadata.reconnect_required === true,
    plaidAccountId: metadata.plaid_account_id || "",
    plaidItemId: metadata.plaid_item_id || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function serializeBillPaymentTransaction(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    billId: row.bill_id,
    paymentMethodId: row.payment_method_id || "",
    providerName: row.provider_name || "",
    accountReferenceMasked: row.account_reference_masked || "",
    amount: Number(row.amount || 0),
    currency: row.currency || "usd",
    status: row.status || "scheduled",
    source: row.source || "manual",
    bulkBatchId: row.bulk_batch_id || "",
    receiptUrl: row.receipt_url || "",
    scheduledFor: row.scheduled_for || null,
    processedAt: row.processed_at || null,
    failedAt: row.failed_at || null,
    failureReason: row.failure_reason || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function serializeAutopayRule(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    billId: row.bill_id,
    paymentMethodId: row.payment_method_id || "",
    enabled: row.enabled === true,
    paused: row.paused === true,
    ruleType: row.rule_type || "full_balance",
    fixedAmount:
      row.fixed_amount == null ? null : Number(row.fixed_amount || 0),
    scheduleType: row.schedule_type || "due_date",
    daysBeforeDue:
      row.days_before_due == null ? null : Number(row.days_before_due || 0),
    monthlyDay: row.monthly_day == null ? null : Number(row.monthly_day || 0),
    notifyDaysBefore: Number(row.notify_days_before || 3),
    lastNotifiedAt: row.last_notified_at || null,
    lastProcessedAt: row.last_processed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function buildBillWritePayload(body, currentBill = null) {
  const providerName = normalizeText(body.providerName, 120);
  const accountLabel = normalizeText(body.accountLabel, 80);
  const rawAccountReference = normalizeText(body.accountNumber, 80);
  const amountDue = normalizeMoneyAmount(body.amountDue);
  const minimumAmount =
    body.minimumAmount === "" || body.minimumAmount == null
      ? null
      : normalizeMoneyAmount(body.minimumAmount);
  const dueDate = normalizeDateOnly(body.dueDate);
  const scheduleAnchorDate = body.scheduleAnchorDate
    ? normalizeDateOnly(body.scheduleAnchorDate)
    : currentBill?.schedule_anchor_date || dueDate;

  if (!providerName) {
    throw new Error("Provider name is required");
  }
  if (amountDue == null || amountDue <= 0) {
    throw new Error("Amount due must be greater than zero");
  }
  if (!dueDate) {
    throw new Error("Due date is required");
  }

  const categoryId = String(body.category || "general").trim().toLowerCase();

  const payload = {
    provider_id: normalizeUuid(body.providerId),
    provider_name: providerName,
    account_label: accountLabel,
    amount_due: amountDue,
    minimum_amount: minimumAmount,
    currency: normalizeText(body.currency || "usd", 10).toLowerCase() || "usd",
    due_date: dueDate,
    schedule_anchor_date: scheduleAnchorDate,
    status: normalizeStatus(
      body.status,
      BILL_STATUSES,
      currentBill?.status || "open",
    ),
    source:
      normalizeText(body.source || currentBill?.source || "manual", 30) ||
      "manual",
    tags: normalizeTagList(body.tags),
    notes: normalizeText(body.notes, 1000),
    autopay_enabled: body.autopayEnabled === true,
    category: categoryId || "general",
    is_recurring: body.isRecurring === true,
    frequency: BILL_FREQUENCIES.includes(body.frequency) ? body.frequency : null,
    updated_at: new Date().toISOString(),
  };

  if (rawAccountReference) {
    payload.account_reference_masked =
      maskAccountReference(rawAccountReference);
    payload.account_reference_hash = hashAccountReference(rawAccountReference);
  } else if (!currentBill) {
    payload.account_reference_masked = "";
    payload.account_reference_hash = "";
  }

  return payload;
}

export function buildAutopayPayload(body, billId, currentRule = null) {
  const ruleType = normalizeStatus(
    body.ruleType,
    AUTOPAY_RULE_TYPES,
    currentRule?.rule_type || "full_balance",
  );
  const scheduleType = normalizeStatus(
    body.scheduleType,
    AUTOPAY_SCHEDULE_TYPES,
    currentRule?.schedule_type || "due_date",
  );
  const fixedAmount =
    body.fixedAmount === "" || body.fixedAmount == null
      ? null
      : normalizeMoneyAmount(body.fixedAmount);
  const daysBeforeDue =
    body.daysBeforeDue === "" || body.daysBeforeDue == null
      ? null
      : Number(body.daysBeforeDue);
  const monthlyDay =
    body.monthlyDay === "" || body.monthlyDay == null
      ? null
      : Number(body.monthlyDay);

  if (ruleType === "fixed_amount" && (!fixedAmount || fixedAmount <= 0)) {
    throw new Error("Fixed AutoPay amount must be greater than zero");
  }

  if (scheduleType === "days_before_due") {
    if (
      !Number.isInteger(daysBeforeDue) ||
      daysBeforeDue < 1 ||
      daysBeforeDue > 30
    ) {
      throw new Error("Days before due must be between 1 and 30");
    }
  }

  if (scheduleType === "monthly_date") {
    if (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 28) {
      throw new Error("Monthly AutoPay day must be between 1 and 28");
    }
  }

  return {
    bill_id: billId,
    payment_method_id: normalizeUuid(body.paymentMethodId),
    enabled: body.enabled === true,
    paused: body.paused === true,
    rule_type: ruleType,
    fixed_amount: fixedAmount,
    schedule_type: scheduleType,
    days_before_due: scheduleType === "days_before_due" ? daysBeforeDue : null,
    monthly_day: scheduleType === "monthly_date" ? monthlyDay : null,
    notify_days_before:
      Number.isInteger(Number(body.notifyDaysBefore)) &&
      Number(body.notifyDaysBefore) >= 0
        ? Number(body.notifyDaysBefore)
        : currentRule?.notify_days_before || 3,
    updated_at: new Date().toISOString(),
  };
}

export function computeBillStatus(row) {
  const status = String(row.status || "open").toLowerCase();
  if (["paid", "processing", "failed", "cancelled"].includes(status)) {
    return status;
  }

  const dueDate = normalizeDateOnly(row.due_date);
  if (!dueDate) return "open";

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  if (dueDate < todayStr) return "overdue";

  // Due within 3 days = "due_soon"
  const dueSoonCutoff = new Date(today);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 3);
  const dueSoonStr = dueSoonCutoff.toISOString().slice(0, 10);
  if (dueDate <= dueSoonStr) return "due_soon";

  // Due more than 7 days away = "upcoming"
  const upcomingCutoff = new Date(today);
  upcomingCutoff.setDate(upcomingCutoff.getDate() + 7);
  const upcomingStr = upcomingCutoff.toISOString().slice(0, 10);
  if (dueDate > upcomingStr) return "upcoming";

  return "open";
}

function computeNextRecurringDueDate(dueDate, frequency) {
  const normalizedDueDate = normalizeDateOnly(dueDate);
  if (!normalizedDueDate) return null;

  const [year, month, day] = normalizedDueDate.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(nextDate.getTime())) return null;

  if (frequency === "weekly") {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else if (frequency === "monthly") {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  } else if (frequency === "yearly") {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
  } else {
    return null;
  }

  return nextDate.toISOString().slice(0, 10);
}

export async function maybeCreateNextRecurringBill({ context, bill }) {
  const isRecurring = bill?.is_recurring === true;
  const frequency = String(bill?.frequency || "").trim().toLowerCase();
  if (!isRecurring || !BILL_FREQUENCIES.includes(frequency)) {
    return null;
  }

  const nextDueDate = computeNextRecurringDueDate(bill.due_date, frequency);
  if (!nextDueDate) return null;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from(BILL_TABLE)
    .select("id")
    .eq("tenant_id", context.tenantDbId)
    .eq("provider_name", bill.provider_name || "")
    .eq("account_label", bill.account_label || "")
    .eq("due_date", nextDueDate)
    .eq("is_recurring", true)
    .eq("frequency", frequency)
    .maybeSingle();

  if (existingError) {
    logSupabaseError(
      "[bill-payments] recurring bill duplicate check error",
      existingError,
      {
        tenantDbId: context.tenantDbId,
        billId: bill.id,
        nextDueDate,
      },
    );
    return null;
  }

  if (existing?.id) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const nextBillPayload = {
    tenant_id: context.tenantDbId,
    user_id: bill.user_id || context.userId,
    provider_id: bill.provider_id || null,
    provider_name: bill.provider_name || "",
    account_label: bill.account_label || "",
    account_reference_masked: bill.account_reference_masked || "",
    account_reference_hash: bill.account_reference_hash || "",
    amount_due: Number(bill.amount_due || 0),
    minimum_amount:
      bill.minimum_amount == null ? null : Number(bill.minimum_amount || 0),
    currency: (bill.currency || "usd").toLowerCase(),
    due_date: nextDueDate,
    schedule_anchor_date: nextDueDate,
    status: computeBillStatus({ due_date: nextDueDate, status: "open" }),
    source: "recurring",
    tags: Array.isArray(bill.tags) ? bill.tags : [],
    notes: bill.notes || "",
    autopay_enabled: bill.autopay_enabled === true,
    category: bill.category || "general",
    is_recurring: true,
    frequency,
    created_at: nowIso,
    updated_at: nowIso,
    last_paid_at: null,
    last_payment_id: null,
  };

  const { data, error } = await supabaseAdmin
    .from(BILL_TABLE)
    .insert(nextBillPayload)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("[bill-payments] recurring bill create error", error, {
      tenantDbId: context.tenantDbId,
      billId: bill.id,
      nextDueDate,
    });
    return null;
  }

  await createNotification({
    tenantId: context.tenantDbId,
    userId: context.userId,
    type: "bill_recurring_created",
    title: "Next recurring bill scheduled",
    message: `${bill.provider_name || "Recurring bill"} was queued for ${nextDueDate}.`,
    metadata: {
      sourceBillId: bill.id,
      nextBillId: data?.id || null,
      frequency,
      nextDueDate,
    },
  });

  return data || null;
}

export async function createNotification({
  tenantId,
  userId,
  type,
  title,
  message,
  metadata = {},
}) {
  const { error } = await supabaseAdmin.from(NOTIFICATIONS_TABLE).insert({
    tenant_id: tenantId,
    user_id: userId || null,
    created_by: userId || null,
    type,
    title,
    message,
    metadata,
    read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    logSupabaseError("[bill-payments] notification insert error", error, {
      tenantId,
      userId,
      type,
    });
  }
}

export async function getOrCreateBillPaymentCustomer(context) {
  const { tenantDbId, userId, email, name } = context;
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from(BILL_PAYMENT_CUSTOMER_TABLE)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    logSupabaseError("[bill-payments] customer lookup error", lookupError, {
      tenantDbId,
      userId,
    });
    throw new Error(lookupError.message);
  }

  if (existing?.stripe_customer_id) {
    return existing;
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured for Bill Payments");
  }

  const customer = await stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: {
      tenantDbId,
      userId,
      source: "bill_payments",
    },
  });

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(BILL_PAYMENT_CUSTOMER_TABLE)
    .upsert(
      {
        tenant_id: tenantDbId,
        user_id: userId,
        stripe_customer_id: customer.id,
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "tenant_id,user_id" },
    )
    .select("*")
    .maybeSingle();

  if (error) {
    logSupabaseError("[bill-payments] customer upsert error", error, {
      tenantDbId,
      userId,
      stripeCustomerId: customer.id,
    });
    throw new Error(error.message);
  }

  return data;
}

export async function createBillPaymentSetupIntent(context, methodType) {
  const customer = await getOrCreateBillPaymentCustomer(context);
  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured for Bill Payments");
  }

  const type = methodType === "bank_account" ? "us_bank_account" : "card";
  const setupIntent = await stripe.setupIntents.create({
    customer: customer.stripe_customer_id,
    payment_method_types: [type],
    usage: "off_session",
    metadata: {
      source: "bill_payments",
      tenantDbId: context.tenantDbId,
      userId: context.userId,
    },
  });

  return {
    customer,
    setupIntent,
  };
}

function mapStripePaymentMethodToRow({
  tenantDbId,
  userId,
  stripeCustomerId,
  paymentMethod,
}) {
  const isBank = paymentMethod.type === "us_bank_account";
  return {
    tenant_id: tenantDbId,
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_payment_method_id: paymentMethod.id,
    method_type: isBank ? "bank_account" : paymentMethod.type || "card",
    method_label: isBank
      ? `${paymentMethod.us_bank_account?.bank_name || "Bank"} ••••${paymentMethod.us_bank_account?.last4 || ""}`
      : `${paymentMethod.card?.brand || "card"} ••••${paymentMethod.card?.last4 || ""}`,
    brand: paymentMethod.card?.brand || "",
    bank_name: paymentMethod.us_bank_account?.bank_name || "",
    last4:
      paymentMethod.card?.last4 || paymentMethod.us_bank_account?.last4 || "",
    exp_month: paymentMethod.card?.exp_month || null,
    exp_year: paymentMethod.card?.exp_year || null,
    fingerprint:
      paymentMethod.card?.fingerprint ||
      paymentMethod.us_bank_account?.fingerprint ||
      "",
    allow_autopay: true,
    status: paymentMethod.us_bank_account?.status_details?.blocked
      ? "blocked"
      : "active",
    metadata: {
      source: "bill_payments",
    },
    updated_at: new Date().toISOString(),
  };
}

export async function syncBillPaymentMethod({
  context,
  paymentMethodId,
  setDefault = false,
}) {
  const customer = await getOrCreateBillPaymentCustomer(context);
  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured for Bill Payments");
  }

  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (
    !paymentMethod ||
    paymentMethod.customer !== customer.stripe_customer_id
  ) {
    throw new Error(
      "Payment method does not belong to this workspace customer",
    );
  }

  if (setDefault) {
    await stripe.customers.update(customer.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });
  }

  if (setDefault) {
    const { error: resetError } = await supabaseAdmin
      .from(BILL_PAYMENT_METHOD_TABLE)
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", context.tenantDbId)
      .eq("user_id", context.userId);

    if (resetError) {
      logSupabaseError(
        "[bill-payments] reset default payment methods error",
        resetError,
        {
          tenantDbId: context.tenantDbId,
          userId: context.userId,
        },
      );
      throw new Error(resetError.message);
    }
  }

  const row = mapStripePaymentMethodToRow({
    tenantDbId: context.tenantDbId,
    userId: context.userId,
    stripeCustomerId: customer.stripe_customer_id,
    paymentMethod,
  });
  row.is_default = setDefault;

  const { data, error } = await supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .upsert(row, { onConflict: "stripe_payment_method_id" })
    .select("*")
    .maybeSingle();

  if (error) {
    logSupabaseError("[bill-payments] payment method upsert error", error, {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      paymentMethodId,
    });
    throw new Error(error.message);
  }

  return data;
}

export async function savePlaidPaymentMethod({
  context,
  itemId,
  account,
  accessToken,
  setDefault = false,
}) {
  const accountId = String(account?.account_id || "").trim();
  if (!itemId || !accountId) {
    throw new Error("Plaid account details are incomplete");
  }

  const customer = await getOrCreateBillPaymentCustomer(context);

  if (setDefault) {
    const { error: resetError } = await supabaseAdmin
      .from(BILL_PAYMENT_METHOD_TABLE)
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", context.tenantDbId)
      .eq("user_id", context.userId);

    if (resetError) {
      logSupabaseError(
        "[bill-payments] reset default payment methods error",
        resetError,
        {
          tenantDbId: context.tenantDbId,
          userId: context.userId,
        },
      );
      throw new Error(resetError.message);
    }
  }

  const nowIso = new Date().toISOString();
  const last4 = String(account.mask || account.last4 || "").slice(-4);
  const bankName = String(account.name || account.official_name || "Bank account").trim();
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${itemId}:${accountId}`)
    .digest("hex");

  const syntheticPaymentMethodId = `plaid:${accountId}`;
  const row = {
    tenant_id: context.tenantDbId,
    user_id: context.userId,
    stripe_customer_id: customer.stripe_customer_id,
    stripe_payment_method_id: syntheticPaymentMethodId,
    method_type: "bank_account",
    method_label: `${bankName} ••••${last4}`,
    brand: "plaid",
    bank_name: bankName,
    last4,
    exp_month: null,
    exp_year: null,
    fingerprint,
    allow_autopay: false,
    is_default: setDefault,
    status: "linked_external",
    metadata: {
      provider: "plaid",
      plaid_item_id: itemId,
      plaid_account_id: accountId,
      plaid_account_mask: last4,
      plaid_account_name: bankName,
      plaid_access_token: String(accessToken || "").trim(),
      reconnect_required: false,
      access_token_present: Boolean(accessToken),
    },
    updated_at: nowIso,
  };

  const { data, error } = await supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .upsert(row, { onConflict: "stripe_payment_method_id" })
    .select("*")
    .maybeSingle();

  if (error) {
    logSupabaseError("[bill-payments] plaid payment method upsert error", error, {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      itemId,
      accountId,
    });
    throw new Error(error.message);
  }

  return data;
}

export async function updateBillStatusesForTenant(tenantDbId) {
  const { data, error } = await supabaseAdmin
    .from(BILL_TABLE)
    .select("id, due_date, status")
    .eq("tenant_id", tenantDbId)
    .in("status", ["open", "overdue"]);

  if (error) {
    logSupabaseError("[bill-payments] bill status refresh query error", error, {
      tenantDbId,
    });
    throw new Error(error.message);
  }

  const nowIso = new Date().toISOString();
  for (const row of data || []) {
    const nextStatus = computeBillStatus(row);
    if (nextStatus === row.status) continue;

    const { error: updateError } = await supabaseAdmin
      .from(BILL_TABLE)
      .update({ status: nextStatus, updated_at: nowIso })
      .eq("id", row.id)
      .eq("tenant_id", tenantDbId);

    if (updateError) {
      logSupabaseError(
        "[bill-payments] bill status refresh update error",
        updateError,
        {
          tenantDbId,
          billId: row.id,
        },
      );
    }
  }
}

export async function listBillPaymentMethodsForContext(context) {
  const { data, error } = await supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .select("*")
    .eq("tenant_id", context.tenantDbId)
    .eq("user_id", context.userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError("[bill-payments] payment methods query error", error, {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
    });
    throw new Error(error.message);
  }

  return data || [];
}

export async function createBillPaymentTransaction({
  context,
  bill,
  paymentMethod,
  amount,
  source,
  bulkBatchId = null,
  scheduledFor = null,
}) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .insert({
      tenant_id: context.tenantDbId,
      user_id: context.userId,
      bill_id: bill.id,
      payment_method_id: paymentMethod?.id || null,
      provider_name: bill.provider_name,
      account_reference_masked: bill.account_reference_masked || "",
      amount,
      currency: bill.currency || "usd",
      status: scheduledFor ? "scheduled" : "processing",
      source: source || "manual",
      bulk_batch_id: bulkBatchId,
      stripe_payment_method_id: paymentMethod?.stripe_payment_method_id || null,
      scheduled_for: scheduledFor,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    logSupabaseError("[bill-payments] transaction insert error", error, {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      billId: bill.id,
    });
    throw new Error(error.message);
  }

  return data;
}

export async function processBillPayment({
  context,
  bill,
  paymentMethod,
  amount,
  source = "manual",
  bulkBatchId = null,
  paymentContext = null,
}) {
  const isPlaidLinkedMethod =
    paymentMethod?.metadata?.provider === "plaid" ||
    String(paymentMethod?.stripe_payment_method_id || "").startsWith("plaid:");

  if (isPlaidLinkedMethod) {
    const plaidAccessToken = String(
      paymentMethod?.metadata?.plaid_access_token || "",
    ).trim();
    const plaidAccountId = String(
      paymentMethod?.metadata?.plaid_account_id || "",
    ).trim();

    if (!plaidAccessToken || !plaidAccountId) {
      throw new Error(
        "Plaid-linked payment method is missing the account linkage required for Stripe processing",
      );
    }

    const alreadyBackedByStripe = /^(ba|src)_/.test(
      String(paymentMethod.stripe_payment_method_id || ""),
    );

    if (!alreadyBackedByStripe) {
      const processorToken = await getPlaidProcessorToken(
        plaidAccessToken,
        plaidAccountId,
      );
      const bankAccount = await attachPlaidBankAccountToStripeCustomer(
        paymentMethod.stripe_customer_id,
        processorToken,
      );
      const nowIso = new Date().toISOString();

      const { error: updateMethodError } = await supabaseAdmin
        .from(BILL_PAYMENT_METHOD_TABLE)
        .update({
          stripe_payment_method_id: bankAccount.id,
          method_type: "bank_account",
          method_label: `${bankAccount.bank_name || paymentMethod.bank_name || "Bank"} ••••${bankAccount.last4 || paymentMethod.last4 || ""}`,
          bank_name: bankAccount.bank_name || paymentMethod.bank_name || "",
          last4: bankAccount.last4 || paymentMethod.last4 || "",
          fingerprint:
            bankAccount.fingerprint || paymentMethod.fingerprint || "",
          status:
            bankAccount.status === "errored"
              ? "failed"
              : "active",
          metadata: {
            ...(paymentMethod.metadata && typeof paymentMethod.metadata === "object"
              ? paymentMethod.metadata
              : {}),
            provider: "plaid",
            stripe_bank_account_id: bankAccount.id,
            stripe_bank_name: bankAccount.bank_name || "",
            stripe_last4: bankAccount.last4 || "",
            bridged_to_stripe_at: nowIso,
          },
          updated_at: nowIso,
        })
        .eq("id", paymentMethod.id)
        .eq("tenant_id", context.tenantDbId)
        .eq("user_id", context.userId);

      if (updateMethodError) {
        logSupabaseError(
          "[bill-payments] plaid stripe bridge update error",
          updateMethodError,
          {
            tenantDbId: context.tenantDbId,
            userId: context.userId,
            paymentMethodId: paymentMethod.id,
          },
        );
        throw new Error(updateMethodError.message);
      }

      paymentMethod.stripe_payment_method_id = bankAccount.id;
      paymentMethod.method_type = "bank_account";
      paymentMethod.method_label = `${bankAccount.bank_name || paymentMethod.bank_name || "Bank"} ••••${bankAccount.last4 || paymentMethod.last4 || ""}`;
      paymentMethod.bank_name = bankAccount.bank_name || paymentMethod.bank_name || "";
      paymentMethod.last4 = bankAccount.last4 || paymentMethod.last4 || "";
      paymentMethod.status = bankAccount.status === "errored" ? "failed" : "active";
      paymentMethod.metadata = {
        ...(paymentMethod.metadata && typeof paymentMethod.metadata === "object"
          ? paymentMethod.metadata
          : {}),
        provider: "plaid",
        stripe_bank_account_id: bankAccount.id,
      };
    }
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured for Bill Payments");
  }

  const transaction = await createBillPaymentTransaction({
    context,
    bill,
    paymentMethod,
    amount,
    source,
    bulkBatchId,
  });

  try {
    const stripeInstrumentId = String(
      paymentMethod.stripe_payment_method_id || "",
    );
    const shouldAttachAchMandate =
      paymentMethod.method_type === "bank_account" &&
      source !== "autopay" &&
      paymentContext?.ipAddress &&
      paymentContext?.userAgent;
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: (bill.currency || "usd").toLowerCase(),
      customer: paymentMethod.stripe_customer_id,
      payment_method: stripeInstrumentId,
      payment_method_types:
        paymentMethod.method_type === "bank_account"
          ? ["us_bank_account"]
          : undefined,
      confirm: true,
      off_session: true,
      mandate_data: shouldAttachAchMandate
        ? {
            customer_acceptance: {
              type: "online",
              online: {
                ip_address: paymentContext.ipAddress,
                user_agent: paymentContext.userAgent,
              },
            },
          }
        : undefined,
      metadata: {
        source: "bill_payment",
        transactionId: transaction.id,
        billId: bill.id,
        tenantDbId: context.tenantDbId,
        userId: context.userId,
      },
    });

    const nextStatus =
      intent.status === "succeeded"
        ? "paid"
        : intent.status === "processing"
          ? "processing"
          : intent.status === "requires_payment_method"
            ? "failed"
            : "processing";

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from(BILL_PAYMENT_TRANSACTION_TABLE)
      .update({
        stripe_payment_intent_id: intent.id,
        status: nextStatus,
        processed_at: nextStatus === "paid" ? nowIso : null,
        updated_at: nowIso,
      })
      .eq("id", transaction.id)
      .eq("tenant_id", context.tenantDbId);

    if (updateError) {
      logSupabaseError(
        "[bill-payments] transaction update error",
        updateError,
        {
          transactionId: transaction.id,
          billId: bill.id,
        },
      );
      throw new Error(updateError.message);
    }

    const billStatus = nextStatus === "paid" ? "paid" : "processing";
    const { error: billUpdateError } = await supabaseAdmin
      .from(BILL_TABLE)
      .update({
        status: billStatus,
        last_paid_at:
          nextStatus === "paid" ? nowIso : bill.last_paid_at || null,
        last_payment_id: transaction.id,
        updated_at: nowIso,
      })
      .eq("id", bill.id)
      .eq("tenant_id", context.tenantDbId);

    if (billUpdateError) {
      logSupabaseError(
        "[bill-payments] bill payment status update error",
        billUpdateError,
        {
          billId: bill.id,
          transactionId: transaction.id,
        },
      );
    }

    await createNotification({
      tenantId: context.tenantDbId,
      userId: context.userId,
      type:
        nextStatus === "paid"
          ? "bill_payment_success"
          : "bill_payment_processing",
      title:
        nextStatus === "paid"
          ? "Bill payment submitted"
          : "Bill payment processing",
      message:
        nextStatus === "paid"
          ? `${bill.provider_name} was paid for $${amount.toFixed(2)}.`
          : `${bill.provider_name} payment is processing for $${amount.toFixed(2)}.`,
      metadata: {
        billId: bill.id,
        transactionId: transaction.id,
        stripePaymentIntentId: intent.id,
      },
    });

    if (nextStatus === "paid") {
      await maybeCreateNextRecurringBill({
        context,
        bill: {
          ...bill,
          status: "paid",
          last_paid_at: nowIso,
          last_payment_id: transaction.id,
        },
      });
    }

    return {
      ...transaction,
      stripe_payment_intent_id: intent.id,
      status: nextStatus,
      processed_at: nextStatus === "paid" ? nowIso : null,
    };
  } catch (error) {
    const nowIso = new Date().toISOString();
    const message = error?.message || "Payment failed";

    await supabaseAdmin
      .from(BILL_PAYMENT_TRANSACTION_TABLE)
      .update({
        status: "failed",
        failed_at: nowIso,
        failure_reason: message,
        updated_at: nowIso,
      })
      .eq("id", transaction.id)
      .eq("tenant_id", context.tenantDbId);

    await supabaseAdmin
      .from(BILL_TABLE)
      .update({ status: computeBillStatus(bill), updated_at: nowIso })
      .eq("id", bill.id)
      .eq("tenant_id", context.tenantDbId);

    await createNotification({
      tenantId: context.tenantDbId,
      userId: context.userId,
      type: "bill_payment_failed",
      title: "Bill payment failed",
      message: `${bill.provider_name} could not be paid. ${message}`,
      metadata: {
        billId: bill.id,
        transactionId: transaction.id,
      },
    });

    throw error;
  }
}

export function resolveAutopayAmount(bill, rule) {
  const amountDue = Number(bill.amount_due || 0);
  if (rule.rule_type === "fixed_amount") {
    return Math.min(Number(rule.fixed_amount || 0), amountDue);
  }
  if (rule.rule_type === "minimum_amount") {
    const minimum = Number(bill.minimum_amount || 0);
    if (minimum <= 0) {
      throw new Error("Minimum amount is not available for this bill");
    }
    return Math.min(minimum, amountDue);
  }
  return amountDue;
}

export function shouldSendAutopayReminder(rule, bill, now = new Date()) {
  if (!rule.enabled || rule.paused) return false;
  const dueDate = normalizeDateOnly(bill.due_date);
  if (!dueDate) return false;
  const notifyDaysBefore = Number(rule.notify_days_before || 0);
  if (notifyDaysBefore < 0) return false;

  const reminderDate = new Date(`${dueDate}T00:00:00.000Z`);
  reminderDate.setUTCDate(reminderDate.getUTCDate() - notifyDaysBefore);
  const todayKey = now.toISOString().slice(0, 10);
  const reminderKey = reminderDate.toISOString().slice(0, 10);
  const lastNotifiedKey = rule.last_notified_at
    ? String(rule.last_notified_at).slice(0, 10)
    : "";

  return todayKey >= reminderKey && todayKey !== lastNotifiedKey;
}

export function isAutopayDue(rule, bill, now = new Date()) {
  if (!rule.enabled || rule.paused) return false;
  const dueDate = normalizeDateOnly(bill.due_date);
  if (!dueDate) return false;
  const due = new Date(`${dueDate}T00:00:00.000Z`);

  if (rule.schedule_type === "days_before_due") {
    due.setUTCDate(due.getUTCDate() - Number(rule.days_before_due || 0));
  }

  if (rule.schedule_type === "monthly_date") {
    const anchor = normalizeDateOnly(
      bill.schedule_anchor_date || bill.due_date,
    );
    const anchorDate = new Date(`${anchor}T00:00:00.000Z`);
    const target = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        Number(rule.monthly_day || 1),
      ),
    );
    if (target < anchorDate) return false;
    return now.toISOString().slice(0, 10) >= target.toISOString().slice(0, 10);
  }

  return now.toISOString().slice(0, 10) >= due.toISOString().slice(0, 10);
}
