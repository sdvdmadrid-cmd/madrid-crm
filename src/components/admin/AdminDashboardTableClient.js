"use client";

import { useMemo, useState } from "react";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function badgeClasses(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "bg-emerald-100 text-emerald-700";
  if (normalized === "pending") return "bg-sky-100 text-sky-700";
  if (normalized === "expired") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function formatMoneyFromCents(cents) {
  const amount = Number(cents || 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function toCsvCell(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export default function AdminDashboardTableClient({ rows }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [trialFilter, setTrialFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [selectedTenantId, setSelectedTenantId] = useState(
    Array.isArray(rows) && rows.length > 0 ? rows[0].id : "",
  );

  const tenantOptions = useMemo(() => {
    return rows.map((row) => ({
      id: row.id,
      label: `${row.companyName} (${row.email})`,
    }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();

    return rows.filter((row) => {
      const matchesSearch =
        !term ||
        String(row.name || "").toLowerCase().includes(term) ||
        String(row.email || "").toLowerCase().includes(term) ||
        String(row.companyName || "").toLowerCase().includes(term) ||
        String(row.id || "").toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === "all" || String(row.status || "").toLowerCase() === statusFilter;

      const trialEnd = row.trialEndDate ? new Date(row.trialEndDate).getTime() : 0;
      const matchesTrial =
        trialFilter === "all" ||
        (trialFilter === "on_trial" && String(row.status || "").toLowerCase() === "trial") ||
        (trialFilter === "expiring_7_days" && trialEnd > now && trialEnd - now <= 7 * 24 * 60 * 60 * 1000) ||
        (trialFilter === "expired_trial" && trialEnd > 0 && trialEnd <= now) ||
        (trialFilter === "subscribed" && String(row.status || "").toLowerCase() === "active");

      const matchesTenant = tenantFilter === "all" || String(row.id || "") === tenantFilter;

      return matchesSearch && matchesStatus && matchesTrial && matchesTenant;
    });
  }, [rows, search, statusFilter, tenantFilter, trialFilter]);

  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.contractors += 1;
        acc.revenueCents += Number(row.revenueCents || 0);
        acc.trial += String(row.status || "").toLowerCase() === "trial" ? 1 : 0;
        acc.active += String(row.status || "").toLowerCase() === "active" ? 1 : 0;
        acc.expired += String(row.status || "").toLowerCase() === "expired" ? 1 : 0;
        return acc;
      },
      { contractors: 0, revenueCents: 0, trial: 0, active: 0, expired: 0 },
    );
  }, [filteredRows]);

  const selectedTenant = useMemo(() => {
    return filteredRows.find((row) => row.id === selectedTenantId) || filteredRows[0] || null;
  }, [filteredRows, selectedTenantId]);

  const selectedTenantHealth = useMemo(() => {
    if (!selectedTenant) return [];

    const health = [];
    const trialEndMs = selectedTenant.trialEndDate ? new Date(selectedTenant.trialEndDate).getTime() : 0;
    const daysToTrialEnd = trialEndMs > 0 ? Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60 * 24)) : null;

    if (String(selectedTenant.status || "").toLowerCase() === "trial" && daysToTrialEnd !== null) {
      health.push({
        label: daysToTrialEnd <= 7 ? "Trial expiring" : "Trial healthy",
        value: daysToTrialEnd <= 7 ? `${Math.max(daysToTrialEnd, 0)} days left` : `${daysToTrialEnd} days left`,
        tone: daysToTrialEnd <= 7 ? "amber" : "sky",
      });
    }

    health.push({
      label: "Client load",
      value: `${selectedTenant.totalClients} clients`,
      tone: selectedTenant.totalClients >= 10 ? "emerald" : "slate",
    });
    health.push({
      label: "Open work",
      value: `${selectedTenant.jobsActive} active jobs`,
      tone: selectedTenant.jobsActive >= 5 ? "sky" : "slate",
    });
    health.push({
      label: "Captured revenue",
      value: formatMoneyFromCents(selectedTenant.revenueCents),
      tone: selectedTenant.revenueCents > 0 ? "emerald" : "slate",
    });

    return health;
  }, [selectedTenant]);

  const toneClasses = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };

  const exportCsv = () => {
    const header = [
      "email",
      "owner_name",
      "company_name",
      "industry",
      "registration_date",
      "last_login",
      "trial_end_date",
      "total_clients",
      "active_jobs",
      "real_revenue_cents",
      "real_revenue_usd",
      "account_status",
    ];

    const lines = filteredRows.map((row) => {
      return [
        toCsvCell(row.email),
        toCsvCell(row.name),
        toCsvCell(row.companyName),
        toCsvCell(row.industry),
        toCsvCell(formatDate(row.createdAt)),
        toCsvCell(formatDate(row.lastLoginAt)),
        toCsvCell(formatDate(row.trialEndDate)),
        toCsvCell(row.totalClients),
        toCsvCell(row.jobsActive),
        toCsvCell(row.revenueCents),
        toCsvCell((Number(row.revenueCents || 0) / 100).toFixed(2)),
        toCsvCell(row.status),
      ].join(",");
    });

    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "FieldBase-admin-contractors.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, owner, company, or tenant id..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-slate-400 md:max-w-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-slate-400"
          >
            <option value="all">All statuses</option>
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
          </select>
          <select
            value={trialFilter}
            onChange={(e) => setTrialFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-slate-400"
          >
            <option value="all">All trial states</option>
            <option value="on_trial">On trial</option>
            <option value="expiring_7_days">Expiring in 7 days</option>
            <option value="expired_trial">Trial expired</option>
            <option value="subscribed">Subscribed</option>
          </select>
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-slate-400 md:min-w-56"
          >
            <option value="all">All tenants</option>
            {tenantOptions.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Export CSV
        </button>
      </div>

      <div className="grid gap-4 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Filtered contractors</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{filteredTotals.contractors}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Filtered revenue</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatMoneyFromCents(filteredTotals.revenueCents)}</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">Trial accounts</p>
          <p className="mt-1 text-xl font-semibold text-sky-900">{filteredTotals.trial}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Active accounts</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">{filteredTotals.active}</p>
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.55fr)_400px]">
        <div className="overflow-x-auto border-b border-slate-200 xl:border-b-0 xl:border-r xl:border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Company</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Industry</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Registration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Last Login</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Trial Ends</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Total Clients</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Active Jobs</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Real Revenue</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Account Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer hover:bg-slate-50 ${selectedTenant?.id === row.id ? "bg-slate-50" : ""}`}
                  onClick={() => setSelectedTenantId(row.id)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">{row.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">{row.companyName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.industry}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{formatDate(row.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">{formatDate(row.lastLoginAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">{formatDate(row.trialEndDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">{row.totalClients}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">{row.jobsActive}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-emerald-700">{formatMoneyFromCents(row.revenueCents)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={11}>
                    No contractors match current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <aside className="bg-slate-50/70 p-4">
          {selectedTenant ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Account detail</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">{selectedTenant.companyName}</h3>
                  <p className="mt-1 text-sm text-slate-600">{selectedTenant.email}</p>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(selectedTenant.status)}`}>
                  {selectedTenant.status}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {selectedTenantHealth.map((item) => (
                  <div key={item.label} className={`rounded-xl border px-4 py-3 ${toneClasses[item.tone]}`}>
                    <p className="text-xs font-medium uppercase tracking-wide opacity-80">{item.label}</p>
                    <p className="mt-1 text-base font-semibold">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-4 border-t border-slate-200 pt-4 text-sm text-slate-700">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Owner</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedTenant.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Industry</p>
                    <p className="mt-1">{selectedTenant.industry}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Registered</p>
                    <p className="mt-1">{formatDate(selectedTenant.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last login</p>
                    <p className="mt-1">{formatDate(selectedTenant.lastLoginAt)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Trial end</p>
                  <p className="mt-1">{formatDate(selectedTenant.trialEndDate)}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tenant ID</p>
                  <p className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                    {selectedTenant.id}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
              Select an account to inspect its profile and activity snapshot.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
