"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function AdminActivityLogClient({ initialRows = [] }) {
  const [rows, setRows] = useState(Array.isArray(initialRows) ? initialRows : []);
  const [loading, setLoading] = useState(initialRows.length === 0);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/admin/activity-log");
      const payload = await getJsonOrThrow(response, "Unable to load activity log");
      setRows(Array.isArray(payload?.data) ? payload.data : []);
    } catch (err) {
      setError(err?.message || "Unable to load activity log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialRows.length === 0) {
      load();
    }
  }, [initialRows.length]);

  const actionOptions = useMemo(() => {
    const unique = new Set(rows.map((row) => row.action).filter(Boolean));
    return ["all", ...Array.from(unique).sort()];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesAction =
        actionFilter === "all" || String(row.action || "") === actionFilter;
      const matchesSearch =
        !term ||
        String(row.action || "").toLowerCase().includes(term) ||
        String(row.user_id || "").toLowerCase().includes(term) ||
        String(row.tenant_id || "").toLowerCase().includes(term) ||
        JSON.stringify(row.metadata || {}).toLowerCase().includes(term);
      return matchesAction && matchesSearch;
    });
  }, [rows, actionFilter, search]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Platform activity log</h2>
        <p className="mt-1 text-sm text-slate-600">
          Audit trail across AI usage, legal acceptance, feature flags, and security events.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action, user, tenant, metadata…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-md"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {actionOptions.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All actions" : option}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mx-4 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="max-h-[640px] overflow-auto divide-y divide-slate-100">
        {filteredRows.map((row) => (
          <div key={row.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold text-slate-900">{row.action}</span>
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
        {!loading && filteredRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No activity matches your filters.</p>
        ) : null}
      </div>
    </section>
  );
}
