"use client";

import { useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function actionLabel(action) {
  const labels = {
    "auth.login.failed": "Failed login",
    "auth.login.rate_limited": "Login rate limited",
    "auth.login.blocked": "Login blocked",
    "ai.request.failed": "AI request failed",
    "platform.feature_flag.updated": "Feature flag changed",
    "legal.accepted": "Legal accepted",
  };
  return labels[action] || action;
}

export default function AdminSecurityWatchClient({ initialData = null }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/admin/security-watch");
      const payload = await getJsonOrThrow(response, "Unable to load security watch");
      setData(payload?.data || null);
    } catch (err) {
      setError(err?.message || "Unable to load security watch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData) {
      load();
    }
  }, [initialData]);

  const metrics = data?.metrics || {};

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Security Watch</h2>
            <p className="mt-1 text-sm text-slate-600">
              Failed logins, rate-limit blocks, AI failures, and platform security events.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error ? (
          <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Blocked now</p>
            <p className="mt-1 text-2xl font-bold text-rose-900">{metrics.blockedKeys ?? 0}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Hot rate keys</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{metrics.hotKeys ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Failed logins</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{metrics.failedLogins ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">AI failures</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{metrics.aiFailures ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h3 className="font-semibold text-slate-900">Rate limit state</h3>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Key</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Count</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Blocked until</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.rateLimits || []).map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-2 font-mono text-xs text-slate-800">{row.key}</td>
                    <td className="px-4 py-2 text-slate-700">{row.count}</td>
                    <td className="px-4 py-2 text-slate-600">{formatWhen(row.blocked_until)}</td>
                  </tr>
                ))}
                {!loading && (data?.rateLimits || []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No elevated rate-limit keys right now.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h3 className="font-semibold text-slate-900">Security audit events</h3>
          </div>
          <div className="max-h-[420px] overflow-auto divide-y divide-slate-100">
            {(data?.auditEvents || []).map((row) => (
              <div key={row.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {actionLabel(row.action)}
                  </span>
                  <span className="text-xs text-slate-500">{formatWhen(row.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  user: {row.user_id || "—"} · tenant: {row.tenant_id || "—"}
                </p>
                {row.metadata && Object.keys(row.metadata).length > 0 ? (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
            {!loading && (data?.auditEvents || []).length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">
                No security audit events yet. Failed logins will appear here after the next attempt.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
