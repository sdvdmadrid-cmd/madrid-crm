import "server-only";

import crypto from "node:crypto";
import { getStripeServerClient } from "@/lib/stripe-payments";
import {
  getBillAccountNumberError,
  normalizeBillAccountNumber,
} from "@/lib/bill-payments-validation";
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
import { decryptSensitive, encryptSensitive } from "@/lib/encryption";

export const BILL_TABLE = "bills";
export const BILL_PROVIDER_TABLE = "bill_providers";
export const BILL_PAYMENT_METHOD_TABLE = "bill_payment_methods";
export const BILL_PAYMENT_CUSTOMER_TABLE = "bill_payment_customers";
export const BILL_PAYMENT_TRANSACTION_TABLE = "bill_payment_transactions";
export const BILL_AUTOPAY_RULE_TABLE = "bill_autopay_rules";
export const BILL_PLATFORM_FEE_TABLE = "bill_payment_platform_fees";
export const BILL_PAYMENT_REMITTANCE_QUEUE_TABLE = "bill_payment_remittance_queue";
export const NOTIFICATIONS_TABLE = "notifications";

const DEFAULT_PROVIDER_REQUIRED_FIELDS = [
  {
    key: "account_number",
    label: "Account number",
    required: true,
    hint: "Use the account number exactly as it appears on the bill.",
  },
];

const DEFAULT_PROVIDER_REQUIREMENT_PROFILE = {
  requiredFields: DEFAULT_PROVIDER_REQUIRED_FIELDS,
  remittanceChannel: "manual_portal",
  settlementSupport: "funding_only",
  remittanceNotes:
    "Funds are captured in-app. Remittance posting to external billers requires biller-network integration.",
};

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

export const BILL_PAYMENTS_FREE_BILLS_LIMIT = 2;

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

export function billPaymentsSubscriptionRequiredResponse({
  errorMessage =
    "Bill Payments subscription required to save bills or payment methods. If you pay 3-4+ bills per month, subscribing is usually worth it.",
  details = null,
} = {}) {
  return new Response(
    JSON.stringify({
      success: false,
      code: "bill_payments_subscription_required",
      subscribeUrl: "/subscriptions?source=bill-payments",
      error: errorMessage,
      details,
    }),
    {
      status: 402,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function requireBillPaymentsSubscriptionForStorage(context) {
  if (context?.isSuperAdmin) return null;
  if (context?.isSubscribed === true) return null;
  return billPaymentsSubscriptionRequiredResponse();
}

export function normalizeMoneyAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function clampPercent(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return numeric;
}

function resolveFeePercentByMethod(methodType = "") {
  const normalizedMethod = String(methodType || "").trim().toLowerCase();
  if (normalizedMethod === "bank_account") {
    return clampPercent(process.env.BILL_PAYMENTS_FEE_PERCENT_ACH, 3.0);
  }
  if (normalizedMethod === "card") {
    return clampPercent(process.env.BILL_PAYMENTS_FEE_PERCENT_CARD, 5.9);
  }
  return clampPercent(process.env.BILL_PAYMENTS_FEE_PERCENT_DEFAULT, 4.5);
}

export function getBillPaymentsPricingConfig(methodType = "") {
  const monthlyFeeUsd = normalizeMoneyAmount(
    process.env.BILL_PAYMENTS_MONTHLY_FEE_USD,
  ) ?? 5;
  const transactionFeePercent = resolveFeePercentByMethod(methodType);

  return {
    monthlyFeeUsd,
    transactionFeePercent,
  };
}

export function calculateBillPaymentPricing({
  baseAmount,
  paymentMethodType = "",
}) {
  const safeBaseAmount = normalizeMoneyAmount(baseAmount) ?? 0;
  const pricing = getBillPaymentsPricingConfig(paymentMethodType);
  const feeAmount = normalizeMoneyAmount(
    safeBaseAmount * (pricing.transactionFeePercent / 100),
  ) ?? 0;
  const totalAmount = normalizeMoneyAmount(safeBaseAmount + feeAmount) ?? 0;

  return {
    baseAmount: safeBaseAmount,
    feeAmount,
    totalAmount,
    monthlyFeeUsd: pricing.monthlyFeeUsd,
    transactionFeePercent: pricing.transactionFeePercent,
  };
}

function resolveChargeMonth(value = "") {
  const input = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(input)) {
    return input;
  }

  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}`;
}

async function markPlatformFeeFailed({
  rowId,
  tenantId,
  failureReason,
  metadata = {},
}) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from(BILL_PLATFORM_FEE_TABLE)
    .update({
      status: "failed",
      failure_reason: String(failureReason || "Charge failed").slice(0, 500),
      failed_at: nowIso,
      updated_at: nowIso,
      metadata,
    })
    .eq("id", rowId)
    .eq("tenant_id", tenantId);
}

export async function processBillPaymentsMonthlyPlatformFees({
  chargeMonth = "",
  dryRun = false,
} = {}) {
  const normalizedChargeMonth = resolveChargeMonth(chargeMonth);
  const pricing = getBillPaymentsPricingConfig();
  const monthlyFeeUsd = normalizeMoneyAmount(pricing.monthlyFeeUsd) ?? 0;

  const summary = {
    chargeMonth: normalizedChargeMonth,
    monthlyFeeUsd,
    candidates: 0,
    charged: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  if (monthlyFeeUsd <= 0) {
    return summary;
  }

  const { data: customers, error: customerError } = await supabaseAdmin
    .from(BILL_PAYMENT_CUSTOMER_TABLE)
    .select("tenant_id, user_id, stripe_customer_id")
    .order("created_at", { ascending: true });

  if (customerError) {
    throw new Error(customerError.message);
  }

  const stripe = getStripeServerClient();
  if (!stripe && !dryRun) {
    throw new Error("Stripe is not configured for monthly platform fee processing");
  }

  summary.candidates = (customers || []).length;

  for (const customer of customers || []) {
    const tenantId = String(customer.tenant_id || "").trim();
    const userId = String(customer.user_id || "").trim();
    const stripeCustomerId = String(customer.stripe_customer_id || "").trim();

    if (!tenantId || !userId || !stripeCustomerId) {
      summary.skipped += 1;
      continue;
    }

    const { data: existingFeeRow, error: existingError } = await supabaseAdmin
      .from(BILL_PLATFORM_FEE_TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("charge_month", normalizedChargeMonth)
      .maybeSingle();

    if (existingError) {
      summary.failed += 1;
      summary.failures.push({
        tenantId,
        userId,
        error: existingError.message,
      });
      continue;
    }

    const existingStatus = String(existingFeeRow?.status || "").toLowerCase();
    if (["paid", "processing"].includes(existingStatus)) {
      summary.skipped += 1;
      continue;
    }

    const { data: method, error: methodError } = await supabaseAdmin
      .from(BILL_PAYMENT_METHOD_TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("allow_autopay", true)
      .in("status", ["active", "processing"])
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (methodError) {
      summary.failed += 1;
      summary.failures.push({ tenantId, userId, error: methodError.message });
      continue;
    }

    if (!method?.stripe_payment_method_id) {
      summary.skipped += 1;
      continue;
    }

    if (dryRun) {
      summary.charged += 1;
      continue;
    }

    const nowIso = new Date().toISOString();
    const nextMetadata = {
      source: "bill_payments_monthly_fee",
      payment_method_type: method.method_type || "card",
      monthly_fee_usd: monthlyFeeUsd,
      transaction_fee_percent: pricing.transactionFeePercent,
    };

    let activeRow = existingFeeRow;
    if (!activeRow) {
      const { data: insertedRow, error: insertError } = await supabaseAdmin
        .from(BILL_PLATFORM_FEE_TABLE)
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          payment_method_id: method.id,
          stripe_payment_method_id: method.stripe_payment_method_id,
          charge_month: normalizedChargeMonth,
          amount: monthlyFeeUsd,
          currency: "usd",
          status: "processing",
          metadata: nextMetadata,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .maybeSingle();

      if (insertError) {
        const isDuplicate = String(insertError.code || "") === "23505";
        if (isDuplicate) {
          summary.skipped += 1;
          continue;
        }

        summary.failed += 1;
        summary.failures.push({ tenantId, userId, error: insertError.message });
        continue;
      }

      activeRow = insertedRow;
    } else {
      const { data: updatedRow, error: updateRowError } = await supabaseAdmin
        .from(BILL_PLATFORM_FEE_TABLE)
        .update({
          stripe_customer_id: stripeCustomerId,
          payment_method_id: method.id,
          stripe_payment_method_id: method.stripe_payment_method_id,
          amount: monthlyFeeUsd,
          status: "processing",
          failure_reason: "",
          failed_at: null,
          updated_at: nowIso,
          metadata: {
            ...(activeRow.metadata && typeof activeRow.metadata === "object"
              ? activeRow.metadata
              : {}),
            ...nextMetadata,
          },
        })
        .eq("id", activeRow.id)
        .eq("tenant_id", tenantId)
        .select("*")
        .maybeSingle();

      if (updateRowError) {
        summary.failed += 1;
        summary.failures.push({
          tenantId,
          userId,
          error: updateRowError.message,
        });
        continue;
      }

      activeRow = updatedRow;
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(monthlyFeeUsd * 100),
        currency: "usd",
        customer: stripeCustomerId,
        payment_method: method.stripe_payment_method_id,
        payment_method_types:
          method.method_type === "bank_account" ? ["us_bank_account"] : undefined,
        confirm: true,
        off_session: true,
        metadata: {
          source: "bill_payments_monthly_fee",
          tenantDbId: tenantId,
          userId,
          chargeMonth: normalizedChargeMonth,
          monthlyFeeUsd: String(monthlyFeeUsd),
        },
      });

      const intentStatus = String(paymentIntent.status || "").toLowerCase();
      const nextStatus = intentStatus === "succeeded"
        ? "paid"
        : intentStatus === "processing"
          ? "processing"
          : "failed";

      if (nextStatus === "failed") {
        const reason =
          paymentIntent.last_payment_error?.message ||
          `Payment intent status: ${paymentIntent.status || "unknown"}`;
        await markPlatformFeeFailed({
          rowId: activeRow.id,
          tenantId,
          failureReason: reason,
          metadata: {
            ...(activeRow.metadata && typeof activeRow.metadata === "object"
              ? activeRow.metadata
              : {}),
            ...nextMetadata,
            stripe_payment_intent_status: paymentIntent.status || "",
          },
        });
        summary.failed += 1;
        summary.failures.push({ tenantId, userId, error: reason });
        continue;
      }

      await supabaseAdmin
        .from(BILL_PLATFORM_FEE_TABLE)
        .update({
          stripe_payment_intent_id: paymentIntent.id,
          status: nextStatus,
          charged_at: nextStatus === "paid" ? nowIso : null,
          failed_at: null,
          failure_reason: "",
          updated_at: nowIso,
          metadata: {
            ...(activeRow.metadata && typeof activeRow.metadata === "object"
              ? activeRow.metadata
              : {}),
            ...nextMetadata,
            stripe_payment_intent_status: paymentIntent.status || "",
          },
        })
        .eq("id", activeRow.id)
        .eq("tenant_id", tenantId);

      summary.charged += 1;
    } catch (chargeError) {
      await markPlatformFeeFailed({
        rowId: activeRow.id,
        tenantId,
        failureReason: chargeError?.message || "Monthly fee charge failed",
        metadata: {
          ...(activeRow.metadata && typeof activeRow.metadata === "object"
            ? activeRow.metadata
            : {}),
          ...nextMetadata,
        },
      });
      summary.failed += 1;
      summary.failures.push({
        tenantId,
        userId,
        error: chargeError?.message || "Monthly fee charge failed",
      });
    }
  }

  return summary;
}

function normalizeProviderRoutingKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSynchronyProvider(providerName = "") {
  const normalized = normalizeProviderRoutingKey(providerName);
  return (
    normalized.includes("synchrony") ||
    normalized.includes("carecredit")
  );
}

function buildAutoRemittanceReference(queueRow) {
  const suffix = String(queueRow?.transaction_id || "")
    .replace(/-/g, "")
    .slice(0, 12)
    .toUpperCase();
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `SYN-${dayKey}-${suffix || "AUTO"}`;
}

function resolveRemittanceRetryAt(attempts) {
  const safeAttempts = Number(attempts || 0);
  const backoffMinutes = Math.min(120, Math.max(5, safeAttempts * 10));
  const next = new Date(Date.now() + backoffMinutes * 60 * 1000);
  return next.toISOString();
}

async function markQueueItemFailed({
  queueRow,
  failureReason,
}) {
  const nextAttempts = Number(queueRow?.attempts || 0) + 1;
  const nowIso = new Date().toISOString();
  const existingMeta =
    queueRow?.metadata && typeof queueRow.metadata === "object"
      ? queueRow.metadata
      : {};

  const nextStatus = nextAttempts >= 5 ? "failed" : "pending_submission";
  const nextAttemptAt =
    nextStatus === "pending_submission"
      ? resolveRemittanceRetryAt(nextAttempts)
      : null;

  await supabaseAdmin
    .from(BILL_PAYMENT_REMITTANCE_QUEUE_TABLE)
    .update({
      status: nextStatus,
      attempts: nextAttempts,
      next_attempt_at: nextAttemptAt,
      updated_at: nowIso,
      metadata: {
        ...existingMeta,
        last_error: String(failureReason || "Remittance submission failed").slice(0, 500),
        last_error_at: nowIso,
      },
    })
    .eq("id", queueRow.id)
    .eq("tenant_id", queueRow.tenant_id);
}

async function markRemittanceSubmitted({
  queueRow,
  transaction,
  bill,
  remittanceReference,
  remittanceChannel,
}) {
  const nowIso = new Date().toISOString();
  const existingTxMeta =
    transaction?.metadata && typeof transaction.metadata === "object"
      ? transaction.metadata
      : {};
  const existingQueueMeta =
    queueRow?.metadata && typeof queueRow.metadata === "object"
      ? queueRow.metadata
      : {};

  const { error: txUpdateError } = await supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .update({
      metadata: {
        ...existingTxMeta,
        remittance_status: "submitted",
        remittance_reference: remittanceReference,
        remittance_channel: remittanceChannel,
        remittance_submitted_at: nowIso,
        remittance_submitted_by: queueRow.user_id,
      },
      updated_at: nowIso,
    })
    .eq("id", queueRow.transaction_id)
    .eq("tenant_id", queueRow.tenant_id);

  if (txUpdateError) {
    throw new Error(txUpdateError.message);
  }

  const { error: billUpdateError } = await supabaseAdmin
    .from(BILL_TABLE)
    .update({
      status: "paid",
      last_paid_at: bill?.last_paid_at || nowIso,
      last_payment_id: queueRow.transaction_id,
      updated_at: nowIso,
    })
    .eq("id", queueRow.bill_id)
    .eq("tenant_id", queueRow.tenant_id);

  if (billUpdateError) {
    throw new Error(billUpdateError.message);
  }

  const { error: queueUpdateError } = await supabaseAdmin
    .from(BILL_PAYMENT_REMITTANCE_QUEUE_TABLE)
    .update({
      status: "submitted",
      attempts: Number(queueRow.attempts || 0) + 1,
      next_attempt_at: null,
      submitted_at: nowIso,
      submitted_by: queueRow.user_id,
      remittance_reference: remittanceReference,
      updated_at: nowIso,
      metadata: {
        ...existingQueueMeta,
        submitted_via: "synchrony_adapter_auto",
        remittance_channel: remittanceChannel,
      },
    })
    .eq("id", queueRow.id)
    .eq("tenant_id", queueRow.tenant_id);

  if (queueUpdateError) {
    throw new Error(queueUpdateError.message);
  }

  await createNotification({
    tenantId: queueRow.tenant_id,
    userId: queueRow.user_id,
    type: "bill_remittance_submitted",
    title: "Remittance submitted automatically",
    message: `${transaction?.provider_name || queueRow.provider_name || "Bill payment"} remittance submitted with reference ${remittanceReference}.`,
    metadata: {
      billId: queueRow.bill_id,
      transactionId: queueRow.transaction_id,
      remittanceReference,
      remittanceChannel,
    },
  });
}

export async function processBillPaymentRemittanceQueue({
  limit = 25,
  dryRun = false,
  providerName = "",
} = {}) {
  const normalizedLimit = Math.max(1, Math.min(100, Number(limit || 25)));
  const nowIso = new Date().toISOString();
  const providerFilter = String(providerName || "").trim();

  const enableSynchronyAutoSubmit =
    String(
      process.env.BILL_REMITTANCE_SYNCHRONY_AUTOSUBMIT ||
        (process.env.NODE_ENV === "production" ? "false" : "true"),
    ).toLowerCase() === "true";

  let query = supabaseAdmin
    .from(BILL_PAYMENT_REMITTANCE_QUEUE_TABLE)
    .select("*")
    .eq("status", "pending_submission")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(normalizedLimit);

  if (providerFilter) {
    query = query.ilike("provider_name", `%${providerFilter}%`);
  }

  const { data: queueRows, error: queueError } = await query;
  if (queueError) {
    throw new Error(queueError.message);
  }

  const summary = {
    candidates: (queueRows || []).length,
    submitted: 0,
    skipped: 0,
    failed: 0,
    dryRun,
    failures: [],
  };

  for (const queueRow of queueRows || []) {
    const supportsSynchrony = isSynchronyProvider(queueRow.provider_name);
    if (!supportsSynchrony) {
      summary.skipped += 1;
      continue;
    }

    if (!enableSynchronyAutoSubmit) {
      summary.skipped += 1;
      continue;
    }

    if (dryRun) {
      summary.submitted += 1;
      continue;
    }

    try {
      const [{ data: transaction, error: txError }, { data: bill, error: billError }] =
        await Promise.all([
          supabaseAdmin
            .from(BILL_PAYMENT_TRANSACTION_TABLE)
            .select("*")
            .eq("id", queueRow.transaction_id)
            .eq("tenant_id", queueRow.tenant_id)
            .maybeSingle(),
          supabaseAdmin
            .from(BILL_TABLE)
            .select("id, tenant_id, status, last_paid_at")
            .eq("id", queueRow.bill_id)
            .eq("tenant_id", queueRow.tenant_id)
            .maybeSingle(),
        ]);

      if (txError) {
        throw new Error(txError.message);
      }
      if (billError) {
        throw new Error(billError.message);
      }
      if (!transaction) {
        throw new Error("Remittance transaction not found");
      }
      if (!bill) {
        throw new Error("Remittance bill not found");
      }

      const remittanceReference = buildAutoRemittanceReference(queueRow);
      await markRemittanceSubmitted({
        queueRow,
        transaction,
        bill,
        remittanceReference,
        remittanceChannel: "synchrony_adapter_auto",
      });
      summary.submitted += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        queueId: queueRow.id,
        transactionId: queueRow.transaction_id,
        providerName: queueRow.provider_name,
        error: error?.message || "Remittance submission failed",
      });

      await markQueueItemFailed({
        queueRow,
        failureReason: error?.message || "Remittance submission failed",
      });
    }
  }

  return summary;
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

function normalizeIdentifierKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function normalizeProviderRequiredFields(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_PROVIDER_REQUIREMENT_PROFILE.requiredFields;
  }

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const key = normalizeIdentifierKey(entry.key);
      if (!key) return null;
      return {
        key,
        label: normalizeText(entry.label || key, 80),
        required: entry.required !== false,
        hint: normalizeText(entry.hint || "", 200),
      };
    })
    .filter(Boolean);

  return normalized.length
    ? normalized
    : DEFAULT_PROVIDER_REQUIREMENT_PROFILE.requiredFields;
}

function normalizeProviderRequirementProfile(row) {
  if (!row || typeof row !== "object") {
    return DEFAULT_PROVIDER_REQUIREMENT_PROFILE;
  }

  const requiredFields = normalizeProviderRequiredFields(row.required_fields);
  const remittanceChannel =
    normalizeText(row.remittance_channel || "manual_portal", 40) ||
    DEFAULT_PROVIDER_REQUIREMENT_PROFILE.remittanceChannel;
  const settlementSupport =
    normalizeText(row.settlement_support || "funding_only", 40) ||
    DEFAULT_PROVIDER_REQUIREMENT_PROFILE.settlementSupport;
  const remittanceNotes =
    normalizeText(
      row.remittance_notes || DEFAULT_PROVIDER_REQUIREMENT_PROFILE.remittanceNotes,
      400,
    ) || DEFAULT_PROVIDER_REQUIREMENT_PROFILE.remittanceNotes;

  return {
    requiredFields,
    remittanceChannel,
    settlementSupport,
    remittanceNotes,
  };
}

export function normalizeProviderIdentifiers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizeIdentifierKey(rawKey);
    if (!key) continue;
    const normalized = normalizeText(rawValue, 120);
    if (!normalized) continue;
    output[key] = normalized;
  }

  return output;
}

export function validateProviderRequirementValues({
  provider,
  accountNumber,
  providerIdentifiers,
}) {
  const profile = normalizeProviderRequirementProfile(provider);
  const identifiers = normalizeProviderIdentifiers(providerIdentifiers);
  const missing = [];

  for (const field of profile.requiredFields) {
    if (!field.required) continue;
    if (field.key === "account_number") {
      if (!String(accountNumber || "").trim()) {
        missing.push(field.label || "Account number");
      }
      continue;
    }
    if (!String(identifiers[field.key] || "").trim()) {
      missing.push(field.label || field.key);
    }
  }

  if (missing.length) {
    throw new Error(`Missing required bill identifiers: ${missing.join(", ")}`);
  }

  return profile;
}

export async function findBillProvider({ providerId, providerName }) {
  const normalizedId = normalizeUuid(providerId);
  if (normalizedId) {
    const { data } = await supabaseAdmin
      .from(BILL_PROVIDER_TABLE)
      .select("*")
      .eq("id", normalizedId)
      .maybeSingle();
    if (data) return data;
  }

  const normalizedName = String(providerName || "")
    .trim()
    .toLowerCase();
  if (!normalizedName) return null;

  const { data } = await supabaseAdmin
    .from(BILL_PROVIDER_TABLE)
    .select("*")
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  return data || null;
}

export function serializeBillProvider(row) {
  const profile = normalizeProviderRequirementProfile(row);
  return {
    id: row.id,
    providerName: row.provider_name || "",
    category: row.category || "general",
    websiteUrl: row.website_url || "",
    supportPhone: row.support_phone || "",
    searchTerms: Array.isArray(row.search_terms) ? row.search_terms : [],
    requiredFields: profile.requiredFields,
    remittanceChannel: profile.remittanceChannel,
    settlementSupport: profile.settlementSupport,
    remittanceNotes: profile.remittanceNotes,
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
    providerIdentifiers:
      row.provider_identifiers && typeof row.provider_identifiers === "object"
        ? row.provider_identifiers
        : {},
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
  const metadata = row.metadata && typeof row.metadata === "object"
    ? row.metadata
    : {};
  const remittanceAmount = Number(
    metadata.remittance_amount ?? metadata.bill_amount ?? row.amount ?? 0,
  );
  const platformFeeAmount = Number(metadata.platform_fee_amount ?? 0);
  const totalChargedAmount = Number(
    metadata.total_charged_amount ?? row.amount ?? 0,
  );
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
    remittanceAmount,
    platformFeeAmount,
    totalChargedAmount,
    monthlyFeeUsd: Number(metadata.monthly_fee_usd ?? 0),
    transactionFeePercent: Number(metadata.transaction_fee_percent ?? 0),
    fundingStatus:
      String(metadata.funding_status || "").trim() ||
      (row.status === "paid"
        ? "funded"
        : row.status === "failed"
          ? "failed"
          : row.status),
    remittanceStatus:
      String(metadata.remittance_status || "").trim() ||
      (row.status === "paid" ? "pending_submission" : "not_started"),
    remittanceChannel: String(metadata.remittance_channel || "").trim() || "",
    remittanceReference:
      String(metadata.remittance_reference || "").trim() || "",
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
  const rawAccountReference = normalizeBillAccountNumber(body.accountNumber);
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
  const accountNumberError = getBillAccountNumberError(rawAccountReference);
  if (accountNumberError) {
    throw new Error(accountNumberError);
  }

  const categoryId = String(body.category || "general").trim().toLowerCase();
  const providerIdentifiers = normalizeProviderIdentifiers(body.providerIdentifiers);

  const payload = {
    provider_id: normalizeUuid(body.providerId),
    provider_name: providerName,
    provider_identifiers: providerIdentifiers,
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

async function persistBillPaymentCustomer(existing, payload, logContext) {
  const table = supabaseAdmin.from(BILL_PAYMENT_CUSTOMER_TABLE);

  if (existing?.id) {
    const { data, error } = await table
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();

    if (error) {
      logSupabaseError("[bill-payments] customer update error", error, logContext);
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await table
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    logSupabaseError("[bill-payments] customer insert error", error, logContext);
    throw new Error(error.message);
  }

  return data;
}

async function persistBillPaymentMethod(existing, payload, logContext) {
  const table = supabaseAdmin.from(BILL_PAYMENT_METHOD_TABLE);

  if (existing?.id) {
    const { data, error } = await table
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();

    if (error) {
      logSupabaseError("[bill-payments] payment method update error", error, logContext);
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await table
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    logSupabaseError("[bill-payments] payment method insert error", error, logContext);
    throw new Error(error.message);
  }

  return data;
}

async function enqueueBillPaymentRemittance({
  transaction,
  bill,
  context,
  reason = "funded_payment_pending_submission",
}) {
  const nowIso = new Date().toISOString();
  const queuePayload = {
    tenant_id: context.tenantDbId,
    user_id: context.userId,
    bill_id: bill.id,
    transaction_id: transaction.id,
    provider_name: bill.provider_name || "",
    account_reference_masked: bill.account_reference_masked || "",
    amount: Number(transaction.amount || bill.amount_due || 0),
    currency: bill.currency || "usd",
    status: "pending_submission",
    reason,
    attempts: 0,
    next_attempt_at: null,
    submitted_at: null,
    submitted_by: null,
    remittance_reference: "",
    metadata: {
      transactionId: transaction.id,
      billId: bill.id,
      providerName: bill.provider_name || "",
      reason,
    },
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { error } = await supabaseAdmin.from(BILL_PAYMENT_REMITTANCE_QUEUE_TABLE).upsert(queuePayload, {
    onConflict: "tenant_id,transaction_id",
  });

  if (error) {
    logSupabaseError("[bill-payments] remittance queue upsert error", error, {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      transactionId: transaction.id,
      billId: bill.id,
    });
    throw new Error(error.message);
  }

  return queuePayload;
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
  return persistBillPaymentCustomer(
    existing,
    {
      tenant_id: tenantDbId,
      user_id: userId,
      stripe_customer_id: customer.id,
      created_at: existing?.created_at || nowIso,
      updated_at: nowIso,
    },
    {
      tenantDbId,
      userId,
      stripeCustomerId: customer.id,
    },
  );
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

  const { data: existingMethod, error: existingMethodError } = await supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .select("id, created_at")
    .eq("tenant_id", context.tenantDbId)
    .eq("user_id", context.userId)
    .eq("stripe_payment_method_id", paymentMethod.id)
    .maybeSingle();

  if (existingMethodError) {
    logSupabaseError("[bill-payments] payment method lookup error", existingMethodError, {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      paymentMethodId,
    });
    throw new Error(existingMethodError.message);
  }

  return persistBillPaymentMethod(
    existingMethod,
    {
      ...row,
      created_at: existingMethod?.created_at || new Date().toISOString(),
    },
    {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      paymentMethodId,
    },
  );
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
      plaid_access_token: encryptSensitive(String(accessToken || "").trim()),
      reconnect_required: false,
      access_token_present: Boolean(accessToken),
    },
    updated_at: nowIso,
  };

  const { data: existingMethod, error: existingMethodError } = await supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .select("id, created_at")
    .eq("tenant_id", context.tenantDbId)
    .eq("user_id", context.userId)
    .eq("stripe_payment_method_id", syntheticPaymentMethodId)
    .maybeSingle();

  if (existingMethodError) {
    logSupabaseError("[bill-payments] plaid payment method lookup error", existingMethodError, {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      itemId,
      accountId,
    });
    throw new Error(existingMethodError.message);
  }

  return persistBillPaymentMethod(
    existingMethod,
    {
      ...row,
      created_at: existingMethod?.created_at || nowIso,
    },
    {
      tenantDbId: context.tenantDbId,
      userId: context.userId,
      itemId,
      accountId,
    },
  );
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
      metadata: {
        funding_status: scheduledFor ? "scheduled" : "processing",
        remittance_status: "not_started",
        remittance_channel: "manual_portal",
        remittance_reference: "",
      },
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
  pricing = null,
  source = "manual",
  bulkBatchId = null,
  paymentContext = null,
}) {
  const isPlaidLinkedMethod =
    paymentMethod?.metadata?.provider === "plaid" ||
    String(paymentMethod?.stripe_payment_method_id || "").startsWith("plaid:");

  if (isPlaidLinkedMethod) {
    const storedPlaidAccessToken = String(
      paymentMethod?.metadata?.plaid_access_token || "",
    ).trim();
    const plaidAccessToken = storedPlaidAccessToken
      ? storedPlaidAccessToken.includes("::")
        ? decryptSensitive(storedPlaidAccessToken)
        : storedPlaidAccessToken
      : "";
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
    const pricingDetails = pricing && typeof pricing === "object"
      ? pricing
      : {
          baseAmount: normalizeMoneyAmount(bill.amount_due) ?? normalizeMoneyAmount(amount) ?? 0,
          feeAmount: 0,
          totalAmount: normalizeMoneyAmount(amount) ?? 0,
          monthlyFeeUsd: getBillPaymentsPricingConfig(paymentMethod?.method_type).monthlyFeeUsd,
          transactionFeePercent: 0,
        };
    const baseAmount = normalizeMoneyAmount(pricingDetails.baseAmount) ?? 0;
    const feeAmount = normalizeMoneyAmount(pricingDetails.feeAmount) ?? 0;
    const totalAmount = normalizeMoneyAmount(pricingDetails.totalAmount) ?? normalizeMoneyAmount(amount) ?? 0;
    const monthlyFeeUsd = normalizeMoneyAmount(pricingDetails.monthlyFeeUsd) ?? 0;
    const transactionFeePercent = Number(pricingDetails.transactionFeePercent || 0);

    const stripeInstrumentId = String(
      paymentMethod.stripe_payment_method_id || "",
    );
    const shouldAttachAchMandate =
      paymentMethod.method_type === "bank_account" &&
      source !== "autopay" &&
      paymentContext?.ipAddress &&
      paymentContext?.userAgent;
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
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
        baseAmount: String(baseAmount),
        feeAmount: String(feeAmount),
        totalAmount: String(totalAmount),
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

    const fundingStatus =
      nextStatus === "paid"
        ? "funded"
        : nextStatus === "failed"
          ? "failed"
          : "processing";
    const remittanceStatus =
      fundingStatus === "funded"
        ? "pending_submission"
        : fundingStatus === "failed"
          ? "blocked"
          : "pending_funding";

    const nowIso = new Date().toISOString();
    const existingMeta =
      transaction.metadata && typeof transaction.metadata === "object"
        ? transaction.metadata
        : {};
    const { error: updateError } = await supabaseAdmin
      .from(BILL_PAYMENT_TRANSACTION_TABLE)
      .update({
        stripe_payment_intent_id: intent.id,
        status: nextStatus,
        processed_at: nextStatus === "paid" ? nowIso : null,
        metadata: {
          ...existingMeta,
          bill_amount: baseAmount,
          remittance_amount: baseAmount,
          platform_fee_amount: feeAmount,
          total_charged_amount: totalAmount,
          monthly_fee_usd: monthlyFeeUsd,
          transaction_fee_percent: transactionFeePercent,
          funding_status: fundingStatus,
          remittance_status: remittanceStatus,
          remittance_channel: "manual_portal",
          remittance_reference: "",
        },
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

    if (nextStatus === "paid") {
      await enqueueBillPaymentRemittance({
        transaction: {
          ...transaction,
          amount: totalAmount,
        },
        bill,
        context,
      });
    }

    const billStatus = nextStatus === "failed" ? computeBillStatus(bill) : "processing";
    const { error: billUpdateError } = await supabaseAdmin
      .from(BILL_TABLE)
      .update({
        status: billStatus,
        last_paid_at: bill.last_paid_at || null,
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
          ? "Funding captured, remittance pending"
          : "Bill payment processing",
      message:
        nextStatus === "paid"
          ? `${bill.provider_name} funding captured for $${totalAmount.toFixed(2)} (bill $${baseAmount.toFixed(2)} + fee $${feeAmount.toFixed(2)}). Remittance status: pending submission.`
          : `${bill.provider_name} payment funding is processing for $${totalAmount.toFixed(2)}.`,
      metadata: {
        billId: bill.id,
        transactionId: transaction.id,
        stripePaymentIntentId: intent.id,
        billAmount: baseAmount,
        platformFeeAmount: feeAmount,
        totalChargedAmount: totalAmount,
        fundingStatus,
        remittanceStatus,
      },
    });

    if (nextStatus === "paid") {
      await maybeCreateNextRecurringBill({
        context,
        bill: {
          ...bill,
          status: "processing",
          last_paid_at: bill.last_paid_at || null,
          last_payment_id: transaction.id,
        },
      });
    }

    return {
      ...transaction,
      amount: totalAmount,
      stripe_payment_intent_id: intent.id,
      status: nextStatus,
      processed_at: nextStatus === "paid" ? nowIso : null,
      metadata: {
        ...((transaction.metadata && typeof transaction.metadata === "object")
          ? transaction.metadata
          : {}),
        bill_amount: baseAmount,
        remittance_amount: baseAmount,
        platform_fee_amount: feeAmount,
        total_charged_amount: totalAmount,
        monthly_fee_usd: monthlyFeeUsd,
        transaction_fee_percent: transactionFeePercent,
        funding_status: fundingStatus,
        remittance_status: remittanceStatus,
        remittance_channel: "manual_portal",
      },
    };
  } catch (error) {
    const nowIso = new Date().toISOString();
    const message = error?.message || "Payment failed";
    const existingMeta =
      transaction.metadata && typeof transaction.metadata === "object"
        ? transaction.metadata
        : {};

    await supabaseAdmin
      .from(BILL_PAYMENT_TRANSACTION_TABLE)
      .update({
        status: "failed",
        failed_at: nowIso,
        failure_reason: message,
        metadata: {
          ...existingMeta,
          funding_status: "failed",
          remittance_status: "blocked",
          remittance_channel: "manual_portal",
          remittance_reference: "",
        },
        updated_at: nowIso,
      })
      .eq("id", transaction.id)
      .eq("tenant_id", context.tenantDbId);

    if (nextStatus === "paid") {
      await enqueueBillPaymentRemittance({
        transaction: {
          ...transaction,
          amount: totalAmount,
        },
        bill,
        context,
      });
    }

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
