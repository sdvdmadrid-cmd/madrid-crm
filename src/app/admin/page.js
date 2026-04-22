import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

function accountStatus(createdAt) {
  const createdMs = new Date(createdAt || 0).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return "Trial";
  const ageDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
  return ageDays < 15 ? "Trial" : "Active";
}

function formatMoneyFromCents(cents) {
  const amount = Number(cents || 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
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

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  const session = verifySessionToken(token);

  if (!session || String(session.role || "").toLowerCase() !== "super_admin") {
    redirect("/login?next=/admin");
  }

  const allUsers = await listAllAuthUsers();
  const contractors = allUsers.filter(isContractorUser);

  const rows = await Promise.all(
    contractors.map(async (user) => {
      const metrics = await fetchContractorMetrics(user.id);
      return {
        id: user.id,
        email: user.email || "-",
        createdAt: user.created_at || null,
        totalClients: metrics.totalClients,
        jobsActive: metrics.jobsActive,
        revenueCents: metrics.revenueCents,
        status: accountStatus(user.created_at),
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

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            ContractorFlow Admin Dashboard
          </h1>
          <p className="text-sm text-slate-600">
            Platform-level monitoring for owner access only.
          </p>
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

        <AdminDashboardTableClient rows={rows} />
      </div>
    </main>
  );
}
