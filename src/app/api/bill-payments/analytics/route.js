import {
  BILL_PAYMENT_METHOD_TABLE,
  BILL_PAYMENT_TRANSACTION_TABLE,
  requireBillPaymentsAccess,
  serializeBillPaymentTransaction,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_LOOKBACK_DAYS = 370;
const MAX_TRANSACTION_ROWS = 3000;
const SAFE_TOKEN_MAX_LEN = 64;
const ALLOWED_INTERVALS = new Set(["daily", "weekly", "monthly"]);
const ALLOWED_METHOD_TYPES = new Set(["all", "card", "bank_account", "unknown"]);
const ALLOWED_STATUSES = new Set(["all", "paid", "failed", "processing", "scheduled"]);

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function clampDateRange(fromDate, toDate, now = new Date()) {
  let safeFrom = new Date(fromDate);
  let safeTo = new Date(toDate);

  if (safeFrom.getTime() > safeTo.getTime()) {
    const temp = safeFrom;
    safeFrom = safeTo;
    safeTo = temp;
  }

  const minAllowed = new Date(now);
  minAllowed.setUTCDate(minAllowed.getUTCDate() - MAX_LOOKBACK_DAYS);

  if (safeFrom < minAllowed) safeFrom = minAllowed;
  if (safeTo > now) safeTo = now;

  return { from: safeFrom, to: safeTo };
}

function toIsoDay(date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeekUtc(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d;
}

function startOfMonthUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getBucketKey(date, interval) {
  if (interval === "monthly") {
    return toIsoDay(startOfMonthUtc(date)).slice(0, 7);
  }
  if (interval === "weekly") {
    return toIsoDay(startOfWeekUtc(date));
  }
  return toIsoDay(date);
}

function normalizeInterval(value) {
  const v = String(value || "weekly").trim().toLowerCase();
  if (ALLOWED_INTERVALS.has(v)) return v;
  return "weekly";
}

function normalizeBool(value, fallback = false) {
  if (value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
}

function pickTransactionAmount(tx) {
  const total = Number(tx.totalChargedAmount || tx.amount || 0);
  return Number.isFinite(total) ? total : 0;
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeToken(value) {
  return safeLower(value).slice(0, SAFE_TOKEN_MAX_LEN);
}

function normalizeEnum(value, allowed, fallback = "all") {
  const v = normalizeToken(value);
  return allowed.has(v) ? v : fallback;
}

function sortUnique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

function summarizeTransactions(items) {
  const summary = items.reduce(
    (acc, tx) => {
      const amount = pickTransactionAmount(tx);
      const txStatus = safeLower(tx.status);
      acc.totalVolume += amount;
      acc.totalFees += Number(tx.platformFeeAmount || 0);
      acc.totalPayments += 1;
      if (txStatus === "paid") {
        acc.acceptedPayments += 1;
        acc.acceptedVolume += amount;
      }
      if (txStatus === "failed") acc.failedPayments += 1;
      if (txStatus === "processing") acc.processingPayments += 1;
      return acc;
    },
    {
      totalVolume: 0,
      totalFees: 0,
      totalPayments: 0,
      acceptedPayments: 0,
      acceptedVolume: 0,
      failedPayments: 0,
      processingPayments: 0,
    },
  );

  const attempts = summary.acceptedPayments + summary.failedPayments;
  summary.successRate = attempts > 0 ? (summary.acceptedPayments / attempts) * 100 : 0;
  return summary;
}

function getSummaryDelta(current, previous) {
  const keys = [
    "acceptedVolume",
    "acceptedPayments",
    "failedPayments",
    "successRate",
    "totalFees",
  ];
  const out = {};
  for (const key of keys) {
    const curr = Number(current?.[key] || 0);
    const prev = Number(previous?.[key] || 0);
    out[key] = {
      absolute: curr - prev,
      percentage: prev === 0 ? (curr === 0 ? 0 : 100) : ((curr - prev) / prev) * 100,
    };
  }
  return out;
}

export async function GET(request) {
  const access = await requireBillPaymentsAccess(request, "read");
  if (access.response) return access.response;

  const { context } = access;
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, now.getUTCDate()));
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const parsedFrom = parseDateOnly(searchParams.get("from")) || defaultFrom;
  const parsedTo = parseDateOnly(searchParams.get("to")) || defaultTo;
  const { from: fromDate, to: toDate } = clampDateRange(parsedFrom, parsedTo, now);

  const toDateExclusive = new Date(toDate);
  toDateExclusive.setUTCDate(toDateExclusive.getUTCDate() + 1);

  const rangeDays = Math.max(1, Math.round((toDateExclusive.getTime() - fromDate.getTime()) / 86400000));
  const previousFromDate = new Date(fromDate);
  previousFromDate.setUTCDate(previousFromDate.getUTCDate() - rangeDays);
  const previousToExclusive = new Date(fromDate);

  const interval = normalizeInterval(searchParams.get("interval"));
  const deduplicated = normalizeBool(searchParams.get("deduplicated"), true);
  const includeConnectedAccounts = normalizeBool(
    searchParams.get("includeConnectedAccounts"),
    true,
  );

  const paymentMethodType = normalizeEnum(
    searchParams.get("paymentMethodType"),
    ALLOWED_METHOD_TYPES,
    "all",
  );
  const brand = normalizeToken(searchParams.get("brand")) || "all";
  const country = normalizeToken(searchParams.get("country")) || "all";
  const interactionType = normalizeToken(searchParams.get("interactionType")) || "all";
  const status = normalizeEnum(searchParams.get("status"), ALLOWED_STATUSES, "all");
  const provider = normalizeToken(searchParams.get("provider")) || "all";

  const [txResult, methodResult] = await Promise.all([
    supabaseAdmin
      .from(BILL_PAYMENT_TRANSACTION_TABLE)
      .select(
        "id, tenant_id, user_id, bill_id, payment_method_id, provider_name, account_reference_masked, amount, currency, status, source, bulk_batch_id, receipt_url, scheduled_for, processed_at, failed_at, failure_reason, metadata, created_at, updated_at",
      )
      .eq("tenant_id", context.tenantDbId)
      .gte("created_at", previousFromDate.toISOString())
      .lt("created_at", toDateExclusive.toISOString())
      .order("created_at", { ascending: false })
      .limit(MAX_TRANSACTION_ROWS),
    supabaseAdmin
      .from(BILL_PAYMENT_METHOD_TABLE)
      .select("id, method_type, brand, metadata")
      .eq("tenant_id", context.tenantDbId),
  ]);

  const firstError = txResult.error || methodResult.error;
  if (firstError) {
    return new Response(
      JSON.stringify({ success: false, error: firstError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const methodMap = new Map(
    (methodResult.data || []).map((row) => [row.id, {
      methodType: safeLower(row.method_type) || "card",
      brand: safeLower(row.brand),
      provider: safeLower(row.metadata?.provider) || "stripe",
      country: safeLower(row.metadata?.card_country || row.metadata?.country),
    }]),
  );

  const serialized = (txResult.data || []).map((row) => {
    const tx = serializeBillPaymentTransaction(row);
    const method = methodMap.get(tx.paymentMethodId) || null;
    return {
      ...tx,
      methodType: method?.methodType || "unknown",
      brand: method?.brand || "unknown",
      provider: method?.provider || "stripe",
      country: method?.country || "unknown",
      interactionType: safeLower(tx.source) || "manual",
    };
  });

  const prefiltered = serialized.filter((tx) => {
    if (!includeConnectedAccounts && tx.provider === "plaid") return false;
    return true;
  });

  const currentPeriod = prefiltered.filter((tx) => {
    const createdAt = new Date(tx.createdAt || tx.updatedAt || Date.now());
    return createdAt >= fromDate && createdAt < toDateExclusive;
  });

  const previousPeriod = prefiltered.filter((tx) => {
    const createdAt = new Date(tx.createdAt || tx.updatedAt || Date.now());
    return createdAt >= previousFromDate && createdAt < previousToExclusive;
  });

  const dedupeList = (list) => (deduplicated
    ? Array.from(
        list
          .reduce((acc, tx) => {
            const key = String(tx.billId || tx.id);
            if (!acc.has(key)) acc.set(key, tx);
            return acc;
          }, new Map())
          .values(),
      )
    : list);

  const dedupedCurrent = dedupeList(currentPeriod);
  const dedupedPrevious = dedupeList(previousPeriod);

  const applyFilters = (list) => list.filter((tx) => {
    if (paymentMethodType && paymentMethodType !== "all" && tx.methodType !== paymentMethodType) return false;
    if (brand && brand !== "all" && tx.brand !== brand) return false;
    if (country && country !== "all" && tx.country !== country) return false;
    if (interactionType && interactionType !== "all" && tx.interactionType !== interactionType) return false;
    if (status && status !== "all" && safeLower(tx.status) !== status) return false;
    if (provider && provider !== "all" && safeLower(tx.providerName) !== provider) return false;
    return true;
  });

  const filtered = applyFilters(dedupedCurrent);
  const filteredPrevious = applyFilters(dedupedPrevious);

  const summary = summarizeTransactions(filtered);
  const previousSummary = summarizeTransactions(filteredPrevious);
  const delta = getSummaryDelta(summary, previousSummary);

  const bucketsMap = new Map();
  for (const tx of filtered) {
    const created = new Date(tx.createdAt || tx.processedAt || tx.updatedAt || Date.now());
    const bucketKey = getBucketKey(created, interval);
    if (!bucketsMap.has(bucketKey)) {
      bucketsMap.set(bucketKey, {
        key: bucketKey,
        acceptedVolume: 0,
        failedVolume: 0,
        totalVolume: 0,
        acceptedPayments: 0,
        failedPayments: 0,
        totalPayments: 0,
      });
    }
    const bucket = bucketsMap.get(bucketKey);
    const amount = pickTransactionAmount(tx);
    bucket.totalVolume += amount;
    bucket.totalPayments += 1;
    if (safeLower(tx.status) === "paid") {
      bucket.acceptedVolume += amount;
      bucket.acceptedPayments += 1;
    }
    if (safeLower(tx.status) === "failed") {
      bucket.failedVolume += amount;
      bucket.failedPayments += 1;
    }
  }

  const buckets = Array.from(bucketsMap.values()).sort((a, b) =>
    String(a.key).localeCompare(String(b.key)),
  );

  const cardTypeOptions = sortUnique(dedupedCurrent.map((tx) => tx.methodType));
  const cardBrandOptions = sortUnique(dedupedCurrent.map((tx) => tx.brand));
  const cardCountryOptions = sortUnique(dedupedCurrent.map((tx) => tx.country));
  const interactionTypeOptions = sortUnique(dedupedCurrent.map((tx) => tx.interactionType));
  const providerOptions = sortUnique(
    dedupedCurrent.map((tx) => safeLower(tx.providerName)).filter(Boolean),
  );

  const providerMap = new Map();
  for (const tx of filtered) {
    const providerName = String(tx.providerName || "Unknown provider").trim() || "Unknown provider";
    if (!providerMap.has(providerName)) {
      providerMap.set(providerName, {
        providerName,
        acceptedVolume: 0,
        failedVolume: 0,
        acceptedPayments: 0,
        failedPayments: 0,
        totalPayments: 0,
      });
    }
    const row = providerMap.get(providerName);
    const amount = pickTransactionAmount(tx);
    row.totalPayments += 1;
    if (safeLower(tx.status) === "paid") {
      row.acceptedPayments += 1;
      row.acceptedVolume += amount;
    }
    if (safeLower(tx.status) === "failed") {
      row.failedPayments += 1;
      row.failedVolume += amount;
    }
  }

  const providers = Array.from(providerMap.values())
    .sort((a, b) => b.acceptedVolume - a.acceptedVolume)
    .slice(0, 12);

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        filters: {
          from: toIsoDay(fromDate),
          to: toIsoDay(toDate),
          interval,
          deduplicated,
          includeConnectedAccounts,
          provider,
        },
        summary,
        previousSummary,
        delta,
        buckets,
        providers,
        quickFilters: {
          cardTypes: cardTypeOptions,
          brands: cardBrandOptions,
          countries: cardCountryOptions,
          interactionTypes: interactionTypeOptions,
          providers: providerOptions,
        },
        recentTransactions: filtered.slice(0, 30),
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    },
  );
}
