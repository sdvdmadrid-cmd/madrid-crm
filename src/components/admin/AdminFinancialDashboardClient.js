"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-helpers";
import { getJsonOrThrow } from "@/lib/api-helpers";

export function AdminFinancialDashboardClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const response = await apiFetch(
          `/api/admin/financial?scope=${encodeURIComponent(activeTab)}`,
        );
        const payload = await getJsonOrThrow(response, "Failed to load financial data");
        setData(payload?.data || null);
        setError(null);
      } catch (err) {
        setError(err.message || "Error loading financial data");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [activeTab]);

  const formatCurrency = (cents) => {
    if (cents === null || cents === undefined) return "$0.00";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <p className="text-sm font-medium text-slate-400">MRR</p>
          <p className="mt-2 text-3xl font-bold text-cyan-400">
            {data ? formatCurrency(data.mrr * 100) : "$0.00"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data?.activeSubscriptions || 0} active subscriptions
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <p className="text-sm font-medium text-slate-400">This Month Revenue</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {data ? formatCurrency(data.currentMonth?.totalRevenue || 0) : "$0.00"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data?.currentMonth?.invoiceCount || 0} invoices
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <p className="text-sm font-medium text-slate-400">Paid Revenue</p>
          <p className="mt-2 text-3xl font-bold text-sky-400">
            {data ? formatCurrency(data.currentMonth?.paidRevenue || 0) : "$0.00"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data ? formatCurrency(data.currentMonth?.pendingRevenue || 0) : "$0.00"}{" "}
            pending
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <p className="text-sm font-medium text-slate-400">Churn Rate</p>
          <p className="mt-2 text-3xl font-bold text-orange-400">
            {data?.churn || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">cancelled this month</p>
        </div>
      </div>

      {/* Revenue History Chart */}
      {data?.history && data.history.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">
            Revenue Trend (Last 12 Months)
          </h3>
          <div className="space-y-3">
            {data.history.map((month) => {
              const maxRevenue = Math.max(...data.history.map((m) => m.totalRevenue));
              const percentage =
                maxRevenue > 0 ? (month.totalRevenue / maxRevenue) * 100 : 0;

              return (
                <div key={`${month.year}-${month.monthNum}`}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-300">{month.month}</span>
                    <span className="text-sm font-medium text-white">
                      {formatCurrency(month.totalRevenue)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderTransactions = () => {
    const transactions = data || [];

    if (transactions.length === 0) {
      return (
        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6 text-center">
          <p className="text-sm text-slate-400">No transactions yet</p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-white/10 bg-slate-950/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 bg-slate-900/50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-slate-300">
                Date
              </th>
              <th className="px-6 py-3 text-left font-medium text-slate-300">
                Amount
              </th>
              <th className="px-6 py-3 text-left font-medium text-slate-300">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, idx) => (
              <tr
                key={idx}
                className="border-b border-white/5 hover:bg-slate-900/30 transition"
              >
                <td className="px-6 py-3 text-slate-300">
                  {new Date(tx.date).toLocaleDateString("es-ES")}
                </td>
                <td className="px-6 py-3 font-medium text-white">
                  {formatCurrency(tx.amount)}
                </td>
                <td className="px-6 py-3">
                  <span
                    className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                      tx.status === "paid"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : tx.status === "pending"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Financial Dashboard</h2>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-white/10">
          {[
            { id: "overview", label: "Overview" },
            { id: "transactions", label: "Transactions" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "text-cyan-400 border-b-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading...</div>
      ) : activeTab === "overview" ? (
        renderOverview()
      ) : (
        renderTransactions()
      )}

      {/* Setup Instructions */}
      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6 mt-6">
        <h3 className="text-lg font-semibold text-white mb-3">Setup Payment Transfer</h3>
        <div className="text-sm text-slate-300 space-y-2">
          <p>
            To automatically transfer payments to your bank account, configure Stripe
            Connect:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Go to Stripe Dashboard → Connect Settings</li>
            <li>Add your bank account information</li>
            <li>Enable automatic payouts (daily or weekly)</li>
            <li>Stripe will deposit funds directly to your bank</li>
          </ol>
          <p className="mt-3 text-xs text-slate-400">
            Stripe typically charges 2.9% + $0.30 per transaction + platform fees.
            Payouts arrive in 1-2 business days.
          </p>
        </div>
      </div>
    </div>
  );
}
