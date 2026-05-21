import "server-only";

import {
  BILL_PAYMENT_METHOD_TABLE,
  BILL_PAYMENT_TRANSACTION_TABLE,
  serializeBillPaymentMethod,
} from "@/lib/bill-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_TRANSACTION_ROWS = 5000;
const MAX_LOOKBACK_DAYS = 370;

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

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 89);
  return { from, to };
}

function pickTransactionAmount(tx) {
  const metadata =
    tx.metadata && typeof tx.metadata === "object" ? tx.metadata : {};
  const total = Number(
    metadata.total_charged_amount ?? tx.amount ?? metadata.bill_amount ?? 0,
  );
  return Number.isFinite(total) ? total : 0;
}

async function buildUserEmailMap(userIds) {
  const map = new Map();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return map;

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (error) {
    console.warn("[platform-payment-cards] listUsers failed", error.message);
    return map;
  }

  for (const user of data?.users || []) {
    if (unique.includes(user.id)) {
      map.set(user.id, user.email || "");
    }
  }
  return map;
}

export async function getPlatformPaymentCardsOverview(options = {}) {
  const now = new Date();
  const parsedFrom = parseDateOnly(options.from);
  const parsedTo = parseDateOnly(options.to);
  const defaults = defaultDateRange();
  const { from, to } = clampDateRange(
    parsedFrom || defaults.from,
    parsedTo || defaults.to,
    now,
  );

  const methodTypeFilter = String(options.methodType || "all").toLowerCase();
  const tenantFilter = String(options.tenantId || "").trim();
  const search = String(options.search || "").trim().toLowerCase();

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  let methodsQuery = supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (tenantFilter) {
    methodsQuery = methodsQuery.eq("tenant_id", tenantFilter);
  }
  if (methodTypeFilter === "card") {
    methodsQuery = methodsQuery.eq("method_type", "card");
  } else if (methodTypeFilter === "bank_account") {
    methodsQuery = methodsQuery.eq("method_type", "bank_account");
  }

  const { data: methodRows, error: methodsError } = await methodsQuery;
  if (methodsError) {
    throw new Error(methodsError.message);
  }

  const methods = methodRows || [];
  const methodIds = methods.map((row) => row.id);

  let txQuery = supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .select(
      "id, tenant_id, user_id, payment_method_id, amount, status, metadata, processed_at, created_at",
    )
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(MAX_TRANSACTION_ROWS);

  if (tenantFilter) {
    txQuery = txQuery.eq("tenant_id", tenantFilter);
  }

  const { data: txRows, error: txError } = await txQuery;
  if (txError) {
    throw new Error(txError.message);
  }

  const transactions = txRows || [];
  const emailByUserId = await buildUserEmailMap(
    methods.map((row) => row.user_id),
  );

  const usageByMethodId = new Map();
  const usageByTenantId = new Map();
  const usageByDay = new Map();
  const brandCounts = new Map();

  for (const tx of transactions) {
    const methodId = tx.payment_method_id || "";
    const status = String(tx.status || "").toLowerCase();
    const amount = pickTransactionAmount(tx);
    const isPaid = status === "paid";
    const isFailed = status === "failed";
    const day = String(tx.processed_at || tx.created_at || "").slice(0, 10);

    if (methodId) {
      const bucket = usageByMethodId.get(methodId) || {
        paymentCount: 0,
        paidCount: 0,
        failedCount: 0,
        volume: 0,
        paidVolume: 0,
        lastUsedAt: null,
      };
      bucket.paymentCount += 1;
      bucket.volume += amount;
      if (isPaid) {
        bucket.paidCount += 1;
        bucket.paidVolume += amount;
      }
      if (isFailed) bucket.failedCount += 1;
      const usedAt = tx.processed_at || tx.created_at;
      if (!bucket.lastUsedAt || String(usedAt) > String(bucket.lastUsedAt)) {
        bucket.lastUsedAt = usedAt;
      }
      usageByMethodId.set(methodId, bucket);
    }

    const tenantBucket = usageByTenantId.get(tx.tenant_id) || {
      tenantId: tx.tenant_id,
      paymentCount: 0,
      paidCount: 0,
      failedCount: 0,
      volume: 0,
      methodCount: 0,
    };
    tenantBucket.paymentCount += 1;
    tenantBucket.volume += amount;
    if (isPaid) tenantBucket.paidCount += 1;
    if (isFailed) tenantBucket.failedCount += 1;
    usageByTenantId.set(tx.tenant_id, tenantBucket);

    if (day) {
      const dayBucket = usageByDay.get(day) || {
        date: day,
        volume: 0,
        payments: 0,
        cardVolume: 0,
        bankVolume: 0,
      };
      dayBucket.payments += 1;
      dayBucket.volume += amount;
      usageByDay.set(day, dayBucket);
    }
  }

  const methodsByTenant = new Map();
  for (const row of methods) {
    const tenantBucket = methodsByTenant.get(row.tenant_id) || {
      cards: 0,
      banks: 0,
      total: 0,
    };
    tenantBucket.total += 1;
    if (row.method_type === "bank_account") tenantBucket.banks += 1;
    else tenantBucket.cards += 1;
    methodsByTenant.set(row.tenant_id, tenantBucket);

    const brandKey = row.brand || row.bank_name || row.method_type || "unknown";
    brandCounts.set(brandKey, (brandCounts.get(brandKey) || 0) + 1);
  }

  for (const [tenantId, bucket] of methodsByTenant) {
    const usage = usageByTenantId.get(tenantId);
    if (usage) {
      usage.methodCount = bucket.total;
    } else {
      usageByTenantId.set(tenantId, {
        tenantId,
        paymentCount: 0,
        paidCount: 0,
        failedCount: 0,
        volume: 0,
        methodCount: bucket.total,
      });
    }
  }

  const serializedMethods = methods
    .map((row) => {
      const usage = usageByMethodId.get(row.id) || {
        paymentCount: 0,
        paidCount: 0,
        failedCount: 0,
        volume: 0,
        paidVolume: 0,
        lastUsedAt: null,
      };
      const base = serializeBillPaymentMethod(row);
      const userEmail = emailByUserId.get(row.user_id) || "";
      return {
        ...base,
        userEmail,
        stripePaymentMethodId: row.stripe_payment_method_id || "",
        fingerprint: row.fingerprint || "",
        usage,
      };
    })
    .filter((row) => {
      if (!search) return true;
      const haystack = [
        row.userEmail,
        row.methodLabel,
        row.brand,
        row.bankName,
        row.last4,
        row.tenantId,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });

  const activeCards = methods.filter(
    (row) => row.method_type === "card" && row.status === "active",
  ).length;
  const activeBanks = methods.filter(
    (row) =>
      row.method_type === "bank_account" && row.status === "active",
  ).length;
  const autopayMethods = methods.filter((row) => row.allow_autopay === true).length;

  let totalVolume = 0;
  let paidVolume = 0;
  let paidCount = 0;
  let failedCount = 0;
  for (const tx of transactions) {
    const amount = pickTransactionAmount(tx);
    totalVolume += amount;
    if (String(tx.status || "").toLowerCase() === "paid") {
      paidVolume += amount;
      paidCount += 1;
    }
    if (String(tx.status || "").toLowerCase() === "failed") {
      failedCount += 1;
    }
  }

  const cardMethodIds = new Set(
    methods.filter((row) => row.method_type === "card").map((row) => row.id),
  );
  let cardVolume = 0;
  for (const tx of transactions) {
    if (cardMethodIds.has(tx.payment_method_id)) {
      cardVolume += pickTransactionAmount(tx);
    }
  }

  const topTenants = Array.from(usageByTenantId.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 12)
    .map((row) => ({
      ...row,
      methodCount: methodsByTenant.get(row.tenantId)?.total || row.methodCount,
    }));

  const timeSeries = Array.from(usageByDay.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const brandBreakdown = Array.from(brandCounts.entries())
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    range: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    summary: {
      totalMethods: methods.length,
      activeCards,
      activeBanks,
      tenantsWithMethods: methodsByTenant.size,
      autopayEnabledMethods: autopayMethods,
      totalPayments: transactions.length,
      paidPayments: paidCount,
      failedPayments: failedCount,
      totalVolume,
      paidVolume,
      cardVolume,
      transactionsTruncated: transactions.length >= MAX_TRANSACTION_ROWS,
    },
    brandBreakdown,
    topTenants,
    timeSeries,
    methods: serializedMethods,
  };
}

export async function getTenantPaymentMethodUsage(context, options = {}) {
  const tenantDbId = context.tenantDbId;
  const userId = context.userId;

  const { data: methods, error: methodsError } = await supabaseAdmin
    .from(BILL_PAYMENT_METHOD_TABLE)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (methodsError) {
    throw new Error(methodsError.message);
  }

  const methodIds = (methods || []).map((row) => row.id);
  if (!methodIds.length) {
    return {
      methods: [],
      summary: {
        totalMethods: 0,
        cardCount: 0,
        bankCount: 0,
        paymentsLast90Days: 0,
        volumeLast90Days: 0,
        successRate: 0,
      },
      recentActivity: [],
    };
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);

  const { data: transactions, error: txError } = await supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTION_TABLE)
    .select(
      "id, payment_method_id, amount, status, metadata, provider_name, processed_at, created_at",
    )
    .eq("tenant_id", tenantDbId)
    .eq("user_id", userId)
    .in("payment_method_id", methodIds)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  if (txError) {
    throw new Error(txError.message);
  }

  const usageByMethod = new Map();
  let paid = 0;
  let failed = 0;
  let volume = 0;

  for (const tx of transactions || []) {
    const amount = pickTransactionAmount(tx);
    volume += amount;
    const status = String(tx.status || "").toLowerCase();
    if (status === "paid") paid += 1;
    if (status === "failed") failed += 1;

    const methodId = tx.payment_method_id;
    const bucket = usageByMethod.get(methodId) || {
      paymentCount: 0,
      volume: 0,
      lastUsedAt: null,
    };
    bucket.paymentCount += 1;
    bucket.volume += amount;
    bucket.lastUsedAt = tx.processed_at || tx.created_at;
    usageByMethod.set(methodId, bucket);
  }

  const totalAttempts = paid + failed;
  const successRate =
    totalAttempts > 0 ? Math.round((paid / totalAttempts) * 100) : 100;

  const enrichedMethods = (methods || []).map((row) => ({
    ...serializeBillPaymentMethod(row),
    usage: usageByMethod.get(row.id) || {
      paymentCount: 0,
      volume: 0,
      lastUsedAt: null,
    },
  }));

  return {
    methods: enrichedMethods,
    summary: {
      totalMethods: enrichedMethods.length,
      cardCount: enrichedMethods.filter((m) => m.methodType === "card").length,
      bankCount: enrichedMethods.filter(
        (m) => m.methodType === "bank_account",
      ).length,
      paymentsLast90Days: (transactions || []).length,
      volumeLast90Days: volume,
      successRate,
    },
    recentActivity: (transactions || []).slice(0, 15).map((tx) => ({
      id: tx.id,
      paymentMethodId: tx.payment_method_id,
      providerName: tx.provider_name || "",
      amount: pickTransactionAmount(tx),
      status: tx.status || "scheduled",
      processedAt: tx.processed_at || tx.created_at,
    })),
  };
}
