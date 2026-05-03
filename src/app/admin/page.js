import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminFeedbackInboxClient from "@/components/admin/AdminFeedbackInboxClient";
import AdminDashboardTableClient from "@/components/admin/AdminDashboardTableClient";
import { verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
  const [feedbackRows, paymentRows] = await Promise.all([
    listRecentFeedback(),
    listRecentPayments(),
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

  const tenantOptions = rows.map((row) => ({
    id: row.id,
    label: `${row.companyName} (${row.email})`,
  }));

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 text-white shadow-xl shadow-slate-200/70">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.25fr)_360px] lg:p-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-300">
                Owner Control Room
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                FieldBase Admin Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Private operating view for platform health, account oversight, feedback handling, and payment monitoring.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-sm">
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
                  Super admin only
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
                  {totals.contractors} tracked tenants
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
                  {feedbackWithUsers.filter((row) => row.status === "new").length} new feedback items
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-300">
                Immediate focus
              </p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-amber-200">Pending payment volume</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {formatMoneyFromCents(paymentSummary.pending * 100)}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4">
                  <p className="text-xs uppercase tracking-wide text-sky-200">Newest signal</p>
                  <p className="mt-1 text-sm leading-6 text-white">
                    {feedbackWithUsers[0]?.message || "No feedback captured yet."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total Contractors
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {totals.contractors}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Platform Revenue
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatMoneyFromCents(totals.revenueCents)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total Clients
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {totals.clients}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Active Jobs
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {totals.jobsActive}
            </p>
          </div>
        </section>

        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Payments Overview
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Recent paid, pending, and failed checkout activity across all tenants.
            </p>
          </div>

          <div className="grid gap-4 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recent Payment Volume</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{formatMoneyFromCents(paymentSummary.total * 100)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Completed</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">{formatMoneyFromCents(paymentSummary.completed * 100)}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Pending</p>
              <p className="mt-1 text-xl font-semibold text-amber-900">{formatMoneyFromCents(paymentSummary.pending * 100)}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-rose-700">Failed / Expired</p>
              <p className="mt-1 text-xl font-semibold text-rose-700">{paymentSummary.failed}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentRows.map((row) => {
                  const tenant = userById.get(row.tenant_id);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-800">
                        <div className="font-medium text-slate-900">{String(tenant?.user_metadata?.companyName || "").trim() || tenant?.email || row.tenant_id}</div>
                        <div className="text-xs text-slate-500">{tenant?.email || ""}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">{new Intl.NumberFormat("en-US", { style: "currency", currency: String(row.currency || "usd").toUpperCase() }).format(Number(row.amount || 0))}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${paymentBadgeClasses(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.provider}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.invoice_id || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</td>
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

        <AdminFeedbackInboxClient
          initialRows={feedbackWithUsers}
          tenants={tenantOptions}
        />

        <AdminDashboardTableClient rows={rows} />
      </div>
    </main>
  );
}
