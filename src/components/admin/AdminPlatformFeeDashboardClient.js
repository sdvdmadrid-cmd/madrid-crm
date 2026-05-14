"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-helpers";

export function AdminPlatformFeeDashboardClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(new Set());

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const result = await apiFetch("/api/admin/bill-payments/platform-fees");

        if (result.success) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error || "Failed to load platform fee data");
        }
      } catch (err) {
        setError(err.message || "Error loading platform fees");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const formatCurrency = (cents) => {
    if (cents === null || cents === undefined) return "$0.00";
    const dollars = typeof cents === "number" ? cents / 100 : Number(cents || 0) / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(dollars);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleRetry = async (feeId, tenantId, chargeMonth) => {
    try {
      setRetrying((prev) => new Set(prev).add(feeId));

      const result = await apiFetch("/api/admin/bill-payments/platform-fee/retry", {
        method: "POST",
        body: {
          feeId,
          tenantId,
          chargeMonth,
        },
      });

      if (result.success) {
        // Reload data
        const reloadResult = await apiFetch("/api/admin/bill-payments/platform-fees");
        if (reloadResult.success) {
          setData(reloadResult.data);
        }
      } else {
        setError(result.error || "Failed to retry charge");
      }
    } catch (err) {
      setError(err.message || "Error retrying charge");
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(feeId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm text-slate-400">Loading platform fees...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6">
        <p className="text-sm text-rose-200">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm text-slate-400">No data</p>
      </div>
    );
  }

  const currentMonth = data.currentMonth || {};
  const failedCharges = data.failedCharges || [];
  const monthlyBreakdown = data.monthlyBreakdown || [];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <p className="text-sm font-medium text-slate-400">This Month Revenue</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {formatCurrency(currentMonth.totalCharged || 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {currentMonth.chargedCount || 0} charged
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <p className="text-sm font-medium text-slate-400">Pending Charges</p>
          <p className="mt-2 text-3xl font-bold text-amber-400">
            {currentMonth.pendingCount || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatCurrency(currentMonth.pendingAmount || 0)} total
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <p className="text-sm font-medium text-slate-400">Failed Charges</p>
          <p className="mt-2 text-3xl font-bold text-rose-400">
            {currentMonth.failedCount || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatCurrency(currentMonth.failedAmount || 0)} lost
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <p className="text-sm font-medium text-slate-400">All-Time Revenue</p>
          <p className="mt-2 text-3xl font-bold text-cyan-400">
            {formatCurrency(data.totalAllTimeRevenue || 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {data.totalAllTimeChargedCount || 0} all-time
          </p>
        </div>
      </div>

      {/* Monthly Breakdown */}
      {monthlyBreakdown.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-6">
          <h3 className="text-lg font-semibold text-white">Monthly Breakdown</h3>
          <div className="mt-4 space-y-3">
            {monthlyBreakdown.map((month) => (
              <div key={month.chargeMonth} className="rounded-lg border border-white/10 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-200">{month.chargeMonth}</p>
                    <p className="text-sm text-slate-400">
                      {month.chargedCount} charged • {month.pendingCount} pending • {month.failedCount} failed
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-400">
                      {formatCurrency(month.totalCharged || 0)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatCurrency(month.totalPending || 0)} pending
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Failed Charges */}
      {failedCharges.length > 0 ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6">
          <h3 className="text-lg font-semibold text-white">Failed Charges ({failedCharges.length})</h3>
          <p className="mt-1 text-sm text-slate-400">Manual retry available below.</p>

          <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">Charge Month</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">Tenant</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">Failure Reason</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">Last Attempt</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {failedCharges.map((charge) => (
                  <tr key={charge.id} className="border-b border-white/10 hover:bg-slate-900/30">
                    <td className="px-4 py-3 text-slate-200">{charge.chargeMonth}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-slate-200">{charge.tenantEmail || charge.tenantId}</p>
                        {charge.userName && (
                          <p className="text-xs text-slate-400">{charge.userName}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {formatCurrency(charge.amount || 0)}
                    </td>
                    <td className="px-4 py-3 text-rose-300 text-xs">
                      {charge.failureReason || "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDate(charge.failedAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() =>
                          handleRetry(charge.id, charge.tenantId, charge.chargeMonth)
                        }
                        disabled={retrying.has(charge.id)}
                        className="rounded px-3 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {retrying.has(charge.id) ? "Retrying..." : "Retry"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <p className="text-sm text-emerald-200">✓ No failed charges</p>
        </div>
      )}
    </div>
  );
}
