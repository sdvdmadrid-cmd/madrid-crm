"use client";

import { useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatCurrency(value) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function statusBadgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active") return "bg-emerald-100 text-emerald-700";
  if (normalized === "trialing") return "bg-blue-100 text-blue-700";
  if (normalized === "paused") return "bg-amber-100 text-amber-700";
  if (normalized === "past_due") return "bg-orange-100 text-orange-700";
  if (normalized === "cancelled") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

export default function AdminSubscriptionsClient() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSubscriptions = async (filterStatus = "") => {
    setLoading(true);
    setError("");
    try {
      const statusFilter = String(filterStatus || "").trim().toLowerCase();
      const url = statusFilter
        ? `/api/admin/subscriptions?status=${encodeURIComponent(statusFilter)}&limit=100`
        : "/api/admin/subscriptions?limit=100";
      const response = await apiFetch(url, { suppressUnauthorizedEvent: true });
      const payload = await getJsonOrThrow(response, "Unable to load subscriptions");
      setRows(Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
      setStats(payload?.data?.stats || null);
    } catch (err) {
      setError(err?.message || "Unable to load subscriptions");
      setRows([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptions("");
  }, []);

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Contractor Subscriptions
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Monitor all active subscriptions, trials, and billing status.
        </p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Total</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Active</div>
            <div className="mt-1 text-xl font-bold text-emerald-600">{stats.active}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Trialing</div>
            <div className="mt-1 text-xl font-bold text-blue-600">{stats.trialing}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Cancelled</div>
            <div className="mt-1 text-xl font-bold text-rose-600">{stats.cancelled}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">MRR</div>
            <div className="mt-1 text-xl font-bold text-slate-900">
              {formatCurrency(stats.mrr)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 border-b border-slate-200 bg-slate-50/70 p-4 flex-wrap">
        <button
          onClick={() => {
            setStatus("");
            loadSubscriptions("");
          }}
          disabled={loading}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            !status
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          All
        </button>
        {["trialing", "active", "paused", "past_due", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              loadSubscriptions(s);
            }}
            disabled={loading}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition capitalize ${
              status === s
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Tenant
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Plan
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Price
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Period
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Stripe
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-800">
                  <div className="font-medium text-slate-900">{row.tenantName}</div>
                  <div className="text-xs text-slate-500">{row.tenantEmail}</div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{row.planName}</td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                  {formatCurrency(row.priceMonthly)}/mo
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                      row.status,
                    )}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {row.currentPeriodStart && row.currentPeriodEnd
                    ? `${formatDateTime(row.currentPeriodStart).split(",")[0]} - ${formatDateTime(row.currentPeriodEnd).split(",")[0]}`
                    : row.trialEndsAt
                      ? `Trial until ${formatDateTime(row.trialEndsAt).split(",")[0]}`
                      : "-"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {row.stripeSubscriptionId !== "-"
                    ? `${row.stripeSubscriptionId.slice(0, 8)}...`
                    : "-"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={7}>
                  No subscriptions found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          Loading subscriptions...
        </div>
      )}
    </section>
  );
}
