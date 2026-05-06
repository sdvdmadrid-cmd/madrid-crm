import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminDashboardTableClient from "@/components/admin/AdminDashboardTableClient";
import AdminAiAssistantClient from "@/components/admin/AdminAiAssistantClient";
import AdminEmailDeliveryClient from "@/components/admin/AdminEmailDeliveryClient";
import AdminFeatureFlagsClient from "@/components/admin/AdminFeatureFlagsClient";
import { verifySessionToken } from "@/lib/auth";
import { getPlatformFeatureFlagMap } from "@/lib/platform-feature-flags";
import { getSessionSecretHealth } from "@/lib/session-secret";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

function normalizeRole(user) {
  return String(
    user?.app_metadata?.role || user?.user_metadata?.role || "contractor",
  ).toLowerCase();
}

function isContractorUser(user) {
  const role = normalizeRole(user);
  if (!role) return true;
  return role === "contractor";
}

function accountStatus(user) {
  const metadata = user?.user_metadata || {};
  if (metadata.isSubscribed === true) return "Active";

  const normalized = String(metadata.status || "").toLowerCase();
  if (normalized === "pending_verification") return "Pending";

  const trialEndMs = metadata.trialEndDate
    ? new Date(metadata.trialEndDate).getTime()
    : 0;
  if (Number.isFinite(trialEndMs) && trialEndMs > Date.now()) return "Trial";

  const createdMs = new Date(user?.created_at || 0).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return "Expired";
  const ageDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
  return ageDays < 30 ? "Trial" : "Expired";
}

function formatMoneyFromCents(cents) {
  const amount = Number(cents || 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function toRelativeTime(value) {
  if (!value) return "-";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return "-";

  const diffMs = ts - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHours = Math.round(diffMin / 60);
  if (Math.abs(diffHours) < 48) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function lastNDaysKeys(days) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}

function buildDailySeries(rows, dateField, valueSelector = () => 1, days = 7) {
  const keys = lastNDaysKeys(days);
  const map = new Map(keys.map((key) => [key, 0]));

  for (const row of rows || []) {
    const raw = row?.[dateField];
    if (!raw) continue;
    const key = dateKey(raw);
    if (!map.has(key)) continue;
    map.set(key, Number(map.get(key) || 0) + Number(valueSelector(row) || 0));
  }

  return keys.map((key) => ({ key, value: Number(map.get(key) || 0) }));
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (["up", "ok", "healthy", "on", "connected"].includes(normalized)) {
    return "text-emerald-700 bg-emerald-50 border-emerald-200";
  }
  if (["warn", "warning", "degraded"].includes(normalized)) {
    return "text-amber-700 bg-amber-50 border-amber-200";
  }
  return "text-rose-700 bg-rose-50 border-rose-200";
}

function paymentBadgeClasses(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return "bg-emerald-100 text-emerald-700";
  if (normalized === "pending") return "bg-amber-100 text-amber-700";
  if (["failed", "expired", "canceled"].includes(normalized)) {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-slate-100 text-slate-700";
}

async function listAllAuthUsers() {
  const perPage = 200;
  let page = 1;
  const users = [];

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const batch = data?.users || [];
    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

async function fetchContractorMetrics(userId) {
  const [
    { count: clientsCount, error: clientsError },
    { data: jobsRows, error: jobsError },
    { data: paidInvoices, error: invoicesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("clients")
      .select("id", { head: true, count: "exact" })
      .eq("tenant_id", userId),
    supabaseAdmin.from("jobs").select("status").eq("tenant_id", userId),
    supabaseAdmin
      .from("invoices")
      .select("total_cents")
      .eq("tenant_id", userId)
      .in("status", ["paid", "Paid"]),
  ]);

  if (clientsError) {
    throw new Error(clientsError.message);
  }
  if (jobsError) {
    throw new Error(jobsError.message);
  }
  if (invoicesError) {
    throw new Error(invoicesError.message);
  }

  const jobsActive = (jobsRows || []).filter(
    (row) => String(row.status || "").toLowerCase() !== "completed",
  ).length;

  const revenueCents = (paidInvoices || []).reduce((sum, row) => {
    return sum + Number(row.total_cents || 0);
  }, 0);

  return {
    totalClients: Number(clientsCount || 0),
    jobsActive,
    revenueCents,
  };
}

async function listRecentFeedback() {
  const { data, error } = await supabaseAdmin
    .from("product_feedback")
    .select("id,user_id,feedback_type,message,current_page,status,created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function listRecentPayments() {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select(
      "id,tenant_id,invoice_id,amount,currency,provider,status,created_at,completed_at,failed_at,stripe_session_id",
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function listRecentWebsites() {
  const { data, error } = await supabaseAdmin
    .from("contractor_websites")
    .select("id,tenant_id,slug,published,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function listRecentJobs() {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("id,tenant_id,status,created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function listRecentInvoices() {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id,tenant_id,status,total_cents,created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function listAuthRateLimits() {
  const { data, error } = await supabaseAdmin
    .from("auth_rate_limits")
    .select("key,count,blocked_until,updated_at")
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function listIntegrations() {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("id,provider,tenant_id,updated_at");

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function listEstimateBuilderRows() {
  const { data, error } = await supabaseAdmin
    .from("estimate_builder")
    .select("id,tenant_id,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function listAiAuditEvents() {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("id,tenant_id,action,created_at")
    .ilike("action", "%ai%")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function checkSupabaseHealth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

  if (!supabaseUrl || !publishableKey) {
    return {
      ok: false,
      reason: "Missing Supabase URL or publishable key",
      latencyMs: null,
    };
  }

  try {
    const startedAt = Date.now();
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: publishableKey },
      cache: "no-store",
    });

    return {
      ok: response.ok,
      reason: response.ok ? "ok" : `Supabase health returned ${response.status}`,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "Supabase request failed",
      latencyMs: null,
    };
  }
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session || String(session.role || "").toLowerCase() !== "super_admin") {
    redirect("/login?next=/admin");
  }

  const allUsers = await listAllAuthUsers();
  const contractors = allUsers.filter(isContractorUser);
  const userById = new Map(allUsers.map((user) => [user.id, user]));

  const [
    feedbackRows,
    paymentRows,
    websites,
    jobs,
    invoices,
    authRateRows,
    integrations,
    estimateBuilderRows,
    aiAuditRows,
    supabaseHealth,
    featureFlagMap,
  ] = await Promise.all([
    listRecentFeedback().catch((error) => {
      console.error("[admin] listRecentFeedback failed", error);
      return [];
    }),
    listRecentPayments().catch((error) => {
      console.error("[admin] listRecentPayments failed", error);
      return [];
    }),
    listRecentWebsites().catch((error) => {
      console.error("[admin] listRecentWebsites failed", error);
      return [];
    }),
    listRecentJobs().catch((error) => {
      console.error("[admin] listRecentJobs failed", error);
      return [];
    }),
    listRecentInvoices().catch((error) => {
      console.error("[admin] listRecentInvoices failed", error);
      return [];
    }),
    listAuthRateLimits().catch((error) => {
      console.error("[admin] listAuthRateLimits failed", error);
      return [];
    }),
    listIntegrations().catch((error) => {
      console.error("[admin] listIntegrations failed", error);
      return [];
    }),
    listEstimateBuilderRows().catch((error) => {
      console.error("[admin] listEstimateBuilderRows failed", error);
      return [];
    }),
    listAiAuditEvents().catch((error) => {
      console.error("[admin] listAiAuditEvents failed", error);
      return [];
    }),
    checkSupabaseHealth(),
    getPlatformFeatureFlagMap().catch((error) => {
      console.error("[admin] getPlatformFeatureFlagMap failed", error);
      return {};
    }),
  ]);

  const rows = await Promise.all(
    contractors.map(async (user) => {
      const metrics = await fetchContractorMetrics(user.id);
      return {
        id: user.id,
        name: String(user?.user_metadata?.name || "").trim() || "-",
        email: user.email || "-",
        companyName:
          String(user?.user_metadata?.companyName || "").trim() || "-",
        industry:
          String(
            user?.user_metadata?.businessType || user?.user_metadata?.industry || "",
          ).trim() || "-",
        createdAt: user.created_at || null,
        lastLoginAt: user.last_sign_in_at || null,
        trialEndDate: user?.user_metadata?.trialEndDate || null,
        totalClients: metrics.totalClients,
        jobsActive: metrics.jobsActive,
        revenueCents: metrics.revenueCents,
        status: accountStatus(user),
      };
    }),
  );

  rows.sort((a, b) => b.revenueCents - a.revenueCents);

  const totals = rows.reduce(
    (acc, row) => {
      acc.contractors += 1;
      acc.revenueCents += row.revenueCents;
      acc.clients += row.totalClients;
      acc.jobsActive += row.jobsActive;
      return acc;
    },
    { contractors: 0, revenueCents: 0, clients: 0, jobsActive: 0 },
  );

  const feedbackWithUsers = feedbackRows.map((row) => {
    const submittedBy = userById.get(row.user_id);
    return {
      ...row,
      userEmail: submittedBy?.email || "",
      companyName:
        String(submittedBy?.user_metadata?.companyName || "").trim() || "",
    };
  });

  const paymentSummary = paymentRows.reduce(
    (acc, row) => {
      const amount = Number(row.amount || 0);
      const normalizedStatus = String(row.status || "").toLowerCase();
      acc.total += amount;
      if (normalizedStatus === "completed") {
        acc.completed += amount;
      }
      if (normalizedStatus === "pending") {
        acc.pending += amount;
      }
      if (["failed", "expired", "canceled"].includes(normalizedStatus)) {
        acc.failed += 1;
      }
      return acc;
    },
    { total: 0, completed: 0, pending: 0, failed: 0 },
  );

  const now = Date.now();
  const thirtyDaysAgo = now - 1000 * 60 * 60 * 24 * 30;
  const sevenDaysAgo = now - 1000 * 60 * 60 * 24 * 7;

  const totalUsers = allUsers.length;
  const activeSubscriptions = allUsers.filter(
    (user) => user?.user_metadata?.isSubscribed === true,
  ).length;
  const trialingUsers = allUsers.filter(
    (user) => accountStatus(user).toLowerCase() === "trial",
  ).length;
  const churnRiskUsers = allUsers.filter(
    (user) => accountStatus(user).toLowerCase() === "expired",
  ).length;

  const stripeRows = paymentRows.filter(
    (row) => String(row.provider || "").toLowerCase() === "stripe",
  );

  const mrrRunRate = stripeRows.reduce((sum, row) => {
    const createdTs = new Date(row.created_at || 0).getTime();
    if (!Number.isFinite(createdTs) || createdTs < thirtyDaysAgo) return sum;
    if (String(row.status || "").toLowerCase() !== "completed") return sum;
    return sum + Number(row.amount || 0);
  }, 0);

  const aiAssists30d = estimateBuilderRows.filter((row) => {
    const createdTs = new Date(row.created_at || 0).getTime();
    return Number.isFinite(createdTs) && createdTs >= thirtyDaysAgo;
  }).length;

  const aiActions7d = aiAuditRows.filter((row) => {
    const createdTs = new Date(row.created_at || 0).getTime();
    return Number.isFinite(createdTs) && createdTs >= sevenDaysAgo;
  }).length;

  const websitesPublished = websites.filter((row) => row.published === true).length;
  const websitesUpdated7d = websites.filter((row) => {
    const updatedTs = new Date(row.updated_at || 0).getTime();
    return Number.isFinite(updatedTs) && updatedTs >= sevenDaysAgo;
  }).length;

  const authBlockedNow = authRateRows.filter((row) => {
    const blockedUntil = new Date(row.blocked_until || 0).getTime();
    return Number.isFinite(blockedUntil) && blockedUntil > now;
  });

  const failedAuthCount = authRateRows.reduce(
    (sum, row) => sum + Number(row.count || 0),
    0,
  );

  const supportSummary = feedbackWithUsers.reduce(
    (acc, row) => {
      const normalized = String(row.status || "").toLowerCase();
      if (normalized === "new") acc.new += 1;
      if (normalized === "reviewed") acc.reviewed += 1;
      if (normalized === "resolved") acc.resolved += 1;
      return acc;
    },
    { new: 0, reviewed: 0, resolved: 0 },
  );

  const weeklySignups = buildDailySeries(allUsers, "created_at", () => 1, 7);
  const weeklyRevenue = buildDailySeries(
    stripeRows.filter((row) => String(row.status || "").toLowerCase() === "completed"),
    "created_at",
    (row) => Number(row.amount || 0),
    7,
  );
  const weeklyAi = buildDailySeries(estimateBuilderRows, "created_at", () => 1, 7);

  const maxWeeklyRevenue = Math.max(
    ...weeklyRevenue.map((day) => Number(day.value || 0)),
    1,
  );
  const maxWeeklySignups = Math.max(
    ...weeklySignups.map((day) => Number(day.value || 0)),
    1,
  );
  const maxWeeklyAi = Math.max(...weeklyAi.map((day) => Number(day.value || 0)), 1);

  const runtimeFlags = [
    {
      name: "Dev Login",
      key: "DEV_LOGIN_ENABLED",
      enabled: String(process.env.DEV_LOGIN_ENABLED || "false") === "true",
    },
    {
      name: "Auth Debug Logs",
      key: "NEXT_PUBLIC_AUTH_DEBUG",
      enabled: String(process.env.NEXT_PUBLIC_AUTH_DEBUG || "0") === "1",
    },
    {
      name: "Legacy Estimate Builder",
      key: "NEXT_PUBLIC_ENABLE_LEGACY_ESTIMATE_BUILDER",
      enabled:
        String(process.env.NEXT_PUBLIC_ENABLE_LEGACY_ESTIMATE_BUILDER || "false") ===
        "true",
    },
    {
      name: "Distributed Rate Limiting",
      key: "UPSTASH_REDIS_REST_URL",
      enabled: Boolean(String(process.env.UPSTASH_REDIS_REST_URL || "").trim()),
    },
  ];

  const secretHealth = getSessionSecretHealth(Number(process.env.SESSION_SECRET_MIN_LENGTH || 32));
  const stripeHealthy = Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim());
  const systemChecks = [
    {
      name: "Supabase Auth",
      status: supabaseHealth.ok ? "ok" : "down",
      detail: supabaseHealth.ok
        ? `Healthy${supabaseHealth.latencyMs ? ` • ${supabaseHealth.latencyMs} ms` : ""}`
        : supabaseHealth.reason,
    },
    {
      name: "Session Secret",
      status: secretHealth.configured && secretHealth.strong ? "ok" : "warn",
      detail: secretHealth.configured
        ? `Configured (${secretHealth.source})`
        : "Missing SESSION_SECRET",
    },
    {
      name: "Stripe",
      status: stripeHealthy ? "ok" : "warn",
      detail: stripeHealthy ? "API key configured" : "Missing STRIPE_SECRET_KEY",
    },
    {
      name: "Rate Limit Guard",
      status: runtimeFlags.find((f) => f.key === "UPSTASH_REDIS_REST_URL")?.enabled
        ? "ok"
        : "warn",
      detail: runtimeFlags.find((f) => f.key === "UPSTASH_REDIS_REST_URL")?.enabled
        ? "Redis-backed"
        : "In-memory fallback",
    },
  ];

  const isModuleEnabled = (key, fallback = true) => {
    if (!(key in featureFlagMap)) return fallback;
    return featureFlagMap[key] === true;
  };

  const activityFeed = [
    ...jobs.slice(0, 10).map((row) => ({
      at: row.created_at,
      type: "job",
      title: `Job ${String(row.status || "created").toLowerCase()}`,
      tenant: userById.get(row.tenant_id)?.email || row.tenant_id,
      tone: "text-sky-700 bg-sky-50 border-sky-200",
    })),
    ...invoices.slice(0, 10).map((row) => ({
      at: row.created_at,
      type: "invoice",
      title: `Invoice ${String(row.status || "open").toLowerCase()}`,
      tenant: userById.get(row.tenant_id)?.email || row.tenant_id,
      amount: formatMoneyFromCents(row.total_cents || 0),
      tone: "text-indigo-700 bg-indigo-50 border-indigo-200",
    })),
    ...stripeRows.slice(0, 10).map((row) => ({
      at: row.created_at,
      type: "payment",
      title: `Stripe ${String(row.status || "pending").toLowerCase()}`,
      tenant: userById.get(row.tenant_id)?.email || row.tenant_id,
      amount: formatMoney(row.amount || 0),
      tone: paymentBadgeClasses(row.status),
    })),
    ...websites.slice(0, 10).map((row) => ({
      at: row.updated_at || row.created_at,
      type: "website",
      title: row.published ? "Website published" : "Website updated",
      tenant: userById.get(row.tenant_id)?.email || row.tenant_id,
      detail: row.slug,
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    })),
  ]
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
    .slice(0, 18);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 text-white shadow-2xl shadow-slate-950/40">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.25fr)_360px] lg:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/90">
                Platform Owner Command Center
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                FieldBase SaaS Operations
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Executive control plane for growth, reliability, monetization, and operator workflows across every tenant.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-sm">
                <div className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-cyan-200">
                  Super admin only
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
                  {totalUsers} users
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
                  {formatMoney(mrrRunRate)} MRR run-rate
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-300">
                Live Snapshot
              </p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-cyan-200">System posture</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {systemChecks.every((check) => check.status === "ok") ? "Healthy" : "Degraded"}
                  </p>
                </div>
                <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-violet-200">Newest activity</p>
                  <p className="mt-1 text-sm leading-6 text-white">
                    {activityFeed[0]?.title
                      ? `${activityFeed[0].title} • ${toRelativeTime(activityFeed[0].at)}`
                      : "No platform activity yet."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/20">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Users</p>
            <p className="mt-2 text-3xl font-semibold text-white">{compactNumber(totalUsers)}</p>
            <p className="mt-1 text-xs text-slate-400">All authenticated accounts</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/20">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Subscriptions</p>
            <p className="mt-2 text-3xl font-semibold text-white">{compactNumber(activeSubscriptions)}</p>
            <p className="mt-1 text-xs text-slate-400">{trialingUsers} on trial</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/20">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">MRR Run-Rate</p>
            <p className="mt-2 text-3xl font-semibold text-white">{formatMoney(mrrRunRate)}</p>
            <p className="mt-1 text-xs text-slate-400">Completed Stripe volume (30d)</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-xl shadow-black/20">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">AI Usage</p>
            <p className="mt-2 text-3xl font-semibold text-white">{compactNumber(aiAssists30d)}</p>
            <p className="mt-1 text-xs text-slate-400">{aiActions7d} AI audit actions in 7d</p>
          </div>
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white">Live Platform Analytics</h2>
            <p className="mt-1 text-sm text-slate-400">Daily trend lines for user growth, Stripe revenue, and AI activity.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">New users (7d)</p>
                <div className="mt-3 flex h-24 items-end gap-1.5">
                  {weeklySignups.map((day) => (
                    <div key={`signup-${day.key}`} className="flex-1 rounded-t bg-cyan-400/80" style={{ height: `${Math.max(10, (day.value / maxWeeklySignups) * 100)}%` }} title={`${day.key}: ${day.value}`} />
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Revenue (7d)</p>
                <div className="mt-3 flex h-24 items-end gap-1.5">
                  {weeklyRevenue.map((day) => (
                    <div key={`revenue-${day.key}`} className="flex-1 rounded-t bg-emerald-400/80" style={{ height: `${Math.max(10, (Number(day.value || 0) / maxWeeklyRevenue) * 100)}%` }} title={`${day.key}: ${formatMoney(day.value)}`} />
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">AI assists (7d)</p>
                <div className="mt-3 flex h-24 items-end gap-1.5">
                  {weeklyAi.map((day) => (
                    <div key={`ai-${day.key}`} className="flex-1 rounded-t bg-violet-400/80" style={{ height: `${Math.max(10, (day.value / maxWeeklyAi) * 100)}%` }} title={`${day.key}: ${day.value}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold text-white">System Health</h2>
            <div className="mt-4 space-y-3">
              {systemChecks.map((check) => (
                <div key={check.name} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-200">{check.name}</p>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(check.status)}`}>
                      {check.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{check.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Website Generation</p>
            <p className="mt-2 text-2xl font-semibold text-white">{websitesPublished}</p>
            <p className="mt-1 text-sm text-slate-400">Published websites</p>
            <p className="mt-3 text-xs text-slate-500">{websitesUpdated7d} updated in last 7 days</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Failed Auth Attempts</p>
            <p className="mt-2 text-2xl font-semibold text-white">{compactNumber(failedAuthCount)}</p>
            <p className="mt-1 text-sm text-slate-400">{authBlockedNow.length} currently blocked keys</p>
            <p className="mt-3 text-xs text-slate-500">From auth_rate_limits</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Stripe Overview</p>
            <p className="mt-2 text-2xl font-semibold text-white">{compactNumber(stripeRows.length)}</p>
            <p className="mt-1 text-sm text-slate-400">Recent Stripe transactions</p>
            <p className="mt-3 text-xs text-slate-500">{formatMoney(paymentSummary.pending)} pending volume</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Contractor Risk</p>
            <p className="mt-2 text-2xl font-semibold text-white">{compactNumber(churnRiskUsers)}</p>
            <p className="mt-1 text-sm text-slate-400">Expired or unsubscribed accounts</p>
            <p className="mt-3 text-xs text-slate-500">{compactNumber(totals.contractors)} total contractors</p>
          </div>
        </section>

        {isModuleEnabled("platform_activity_feed", true) ||
        isModuleEnabled("platform_support_queue", true) ? (
        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          {isModuleEnabled("platform_activity_feed", true) ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white">Contractor Activity Feed</h2>
            <p className="mt-1 text-sm text-slate-400">Cross-tenant stream of jobs, invoices, payments, and website updates.</p>

            <div className="mt-4 space-y-2">
              {activityFeed.map((item, index) => (
                <div key={`${item.type}-${item.at}-${index}`} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${item.tone}`}>
                        {item.type}
                      </span>
                      <p className="text-sm font-medium text-slate-200">{item.title}</p>
                    </div>
                    <p className="text-xs text-slate-500">{toRelativeTime(item.at)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.tenant}
                    {item.amount ? ` • ${item.amount}` : ""}
                    {item.detail ? ` • ${item.detail}` : ""}
                  </p>
                </div>
              ))}
              {activityFeed.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-500">
                  No recent platform activity.
                </div>
              ) : null}
            </div>
          </div>
          ) : null}

          {isModuleEnabled("platform_support_queue", true) ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold text-white">Support Tickets</h2>
            <p className="mt-1 text-sm text-slate-400">Operational queue derived from product feedback submissions.</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
                <p className="text-xs uppercase tracking-wide text-rose-200">New</p>
                <p className="mt-1 text-xl font-semibold text-white">{supportSummary.new}</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="text-xs uppercase tracking-wide text-amber-200">In Review</p>
                <p className="mt-1 text-xl font-semibold text-white">{supportSummary.reviewed}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <p className="text-xs uppercase tracking-wide text-emerald-200">Resolved</p>
                <p className="mt-1 text-xl font-semibold text-white">{supportSummary.resolved}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {feedbackWithUsers.slice(0, 5).map((ticket) => (
                <div key={ticket.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-slate-400">{ticket.feedback_type}</p>
                    <p className="text-xs text-slate-500">{toRelativeTime(ticket.created_at)}</p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-200">{ticket.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{ticket.companyName || ticket.userEmail || "Unknown tenant"}</p>
                </div>
              ))}
            </div>
          </div>
          ) : null}
        </section>
        ) : null}

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <AdminFeatureFlagsClient />

          {isModuleEnabled("platform_internal_controls", true) ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white">Internal Admin Controls</h2>
            <p className="mt-1 text-sm text-slate-400">Operational controls for AI messaging, outbound email, and tenant-level intervention.</p>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {isModuleEnabled("platform_ai_ops", true) ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                <p className="mb-2 text-sm font-medium text-slate-200">AI Operations</p>
                <AdminAiAssistantClient />
              </div>
              ) : null}

              {isModuleEnabled("platform_email_ops", true) ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                <p className="mb-2 text-sm font-medium text-slate-200">Email Reliability</p>
                <AdminEmailDeliveryClient />
              </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <a href="#tenant-command-center" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10">Tenant command center</a>
              <a href="#stripe-overview" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10">Stripe overview</a>
              <a href="#security-watch" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10">Security watch</a>
              <a href="#support-queue" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10">Support queue</a>
            </div>
          </div>
          ) : null}
        </section>

        {isModuleEnabled("platform_stripe_overview", true) ? (
        <section id="stripe-overview" className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-xl shadow-black/20">
          <div className="border-b border-white/10 bg-slate-900/90 px-4 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-white">Stripe Revenue & Transaction Stream</h2>
            <p className="mt-1 text-sm text-slate-400">Real-time payment posture across completed, pending, and failed sessions.</p>
          </div>

          <div className="grid gap-4 border-b border-white/10 bg-slate-900/60 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Recent Payment Volume</p>
              <p className="mt-1 text-xl font-semibold text-white">{formatMoney(paymentSummary.total)}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-200">Completed</p>
              <p className="mt-1 text-xl font-semibold text-white">{formatMoney(paymentSummary.completed)}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-200">Pending</p>
              <p className="mt-1 text-xl font-semibold text-white">{formatMoney(paymentSummary.pending)}</p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-rose-200">Failed / Expired</p>
              <p className="mt-1 text-xl font-semibold text-white">{paymentSummary.failed}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paymentRows.map((row) => {
                  const tenant = userById.get(row.tenant_id);
                  return (
                    <tr key={row.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-sm text-slate-200">
                        <div className="font-medium text-white">{String(tenant?.user_metadata?.companyName || "").trim() || tenant?.email || row.tenant_id}</div>
                        <div className="text-xs text-slate-500">{tenant?.email || ""}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-white">{new Intl.NumberFormat("en-US", { style: "currency", currency: String(row.currency || "usd").toUpperCase() }).format(Number(row.amount || 0))}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${paymentBadgeClasses(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">{row.provider}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">{row.invoice_id || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
                    </tr>
                  );
                })}
                {paymentRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>
                      No payments recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {isModuleEnabled("platform_security_watch", true) ? (
        <section id="security-watch" className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold text-white">Auth Threat Watch</h2>
            <p className="mt-1 text-sm text-slate-400">Most recent rate-limit keys and blocked windows.</p>
            <div className="mt-4 space-y-2">
              {authRateRows.slice(0, 8).map((row) => {
                const blockedUntil = row.blocked_until ? new Date(row.blocked_until).toLocaleString() : "-";
                return (
                  <div key={row.key} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-300">{row.key}</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">{row.count}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Blocked until: {blockedUntil}</p>
                  </div>
                );
              })}
              {authRateRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-500">
                  No auth rate-limit records available.
                </div>
              ) : null}
            </div>
          </div>

          <div id="support-queue" className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold text-white">Support Queue</h2>
            <p className="mt-1 text-sm text-slate-400">Current tickets waiting for operator action.</p>
            <div className="mt-4 space-y-2">
              {feedbackWithUsers.slice(0, 8).map((row) => (
                <div key={row.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-slate-400">{row.status}</p>
                    <p className="text-xs text-slate-500">{toRelativeTime(row.created_at)}</p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-200">{row.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{row.companyName || row.userEmail || "Unknown"}</p>
                </div>
              ))}
              {feedbackWithUsers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-500">
                  No support tickets in queue.
                </div>
              ) : null}
            </div>
          </div>
        </section>
        ) : null}

        <div id="tenant-command-center">
          <AdminDashboardTableClient rows={rows} />
        </div>
      </div>
    </main>
  );
}
