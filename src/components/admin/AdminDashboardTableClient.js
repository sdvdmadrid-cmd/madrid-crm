"use client";

import { useMemo, useState } from "react";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
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

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !term ||
        String(row.email || "")
          .toLowerCase()
          .includes(term) ||
        String(row.id || "")
          .toLowerCase()
          .includes(term);

      const matchesStatus =
        statusFilter === "all" ||
        String(row.status || "").toLowerCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.contractors += 1;
        acc.revenueCents += Number(row.revenueCents || 0);
        return acc;
      },
      { contractors: 0, revenueCents: 0 },
    );
  }, [filteredRows]);

  const exportCsv = () => {
    const header = [
      "email",
      "registration_date",
      "total_clients",
      "active_jobs",
      "real_revenue_cents",
      "real_revenue_usd",
      "account_status",
    ];

    const lines = filteredRows.map((row) => {
      return [
        toCsvCell(row.email),
        toCsvCell(formatDate(row.createdAt)),
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
    link.setAttribute("download", "contractorflow-admin-contractors.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contractor email..."
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

      <div className="grid gap-4 border-b border-slate-200 p-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Filtered Contractors
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {filteredTotals.contractors}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Filtered Revenue
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatMoneyFromCents(filteredTotals.revenueCents)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Registration
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Total Clients
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Active Jobs
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Real Revenue
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Account Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">
                  {row.email}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                  {formatDate(row.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">
                  {row.totalClients}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">
                  {row.jobsActive}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-emerald-700">
                  {formatMoneyFromCents(row.revenueCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  {row.status === "Active"
                    ? <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Active
                      </span>
                    : <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Trial
                      </span>}
                </td>
              </tr>
            ))}
            {filteredRows.length === 0
              ? <tr>
                  <td
                    className="px-4 py-6 text-center text-sm text-slate-500"
                    colSpan={6}
                  >
                    No contractors match current filters.
                  </td>
                </tr>
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
