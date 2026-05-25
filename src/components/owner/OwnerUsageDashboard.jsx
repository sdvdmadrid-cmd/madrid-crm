"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-auth";

const REFRESH_MS = 30_000;

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (typeof n === "number") {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }
  return String(n);
}

function CapacityBar({ label, current, soft, hard, bottleneck }) {
  const pctSoft = soft > 0 ? Math.min(100, (current / soft) * 100) : 0;
  const pctHard = hard > 0 ? Math.min(100, (current / hard) * 100) : 0;
  const tone =
    pctSoft >= 95 ? "danger" : pctSoft >= 75 ? "warn" : pctSoft >= 40 ? "ok" : "calm";
  const fill =
    tone === "danger"
      ? "linear-gradient(90deg,#fca5a5,#ef4444)"
      : tone === "warn"
        ? "linear-gradient(90deg,#fde68a,#f59e0b)"
        : "linear-gradient(90deg,#86efac,#10b981)";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-xs text-slate-400">
          {fmt(current)} <span className="text-slate-500">/ {fmt(soft)} soft</span>
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          style={{
            width: `${Math.max(2, pctSoft)}%`,
            height: "100%",
            background: fill,
            transition: "width 600ms ease",
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>{pctSoft.toFixed(1)}% of soft cap</span>
        <span>hard cap {fmt(hard)} ({pctHard.toFixed(1)}%)</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Next bottleneck: {bottleneck}</p>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{fmt(value)}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function OwnerUsageDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await apiFetch("/api/owner/usage", { cache: "no-store" });
      if (!res.ok) {
        setError(`Usage fetch failed (${res.status})`);
        return;
      }
      const payload = await res.json();
      setData(payload?.data || null);
      setRefreshedAt(Date.now());
    } catch (err) {
      setError(err?.message || "Usage fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const caps = useMemo(() => {
    if (!data?.capacity) return [];
    return Object.values(data.capacity);
  }, [data]);

  return (
    <section
      className="rounded-2xl border border-white/10 p-5 text-white"
      style={{
        background:
          "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(168,85,247,0.16) 100%)",
      }}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Platform usage</h2>
          <p className="mt-1 text-sm text-slate-300">
            Live tenants, AI spend, business volume, and capacity headroom.
            Auto-refreshes every 30s.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error ? (
        <p className="mt-4 text-sm text-rose-200" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Tenants"
              value={data.tenants?.total ?? 0}
              sub={`${fmt(data.tenants?.live ?? 0)} published · ${fmt(
                data.tenants?.draftDirty ?? 0,
              )} with unpublished changes`}
            />
            <StatCard
              label="MAU (30d)"
              value={data.users?.mau ?? 0}
              sub={`${fmt(data.users?.total ?? 0)} total auth users`}
            />
            <StatCard
              label="AI spend (30d)"
              value={`$${(data.ai?.spendUsd30d ?? 0).toFixed(2)}`}
              sub={`${fmt(data.ai?.requests30d ?? 0)} requests · ${fmt(
                data.ai?.requests24h ?? 0,
              )} last 24h`}
            />
            <StatCard
              label="Audit actions / min"
              value={data.activity?.actionsLastMinute ?? 0}
              sub="Rolling 60s window (rough RPS proxy)"
            />
          </div>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Business volume
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { table: "website_leads", label: "Leads" },
              { table: "estimates", label: "Estimates" },
              { table: "invoices", label: "Invoices" },
              { table: "jobs", label: "Jobs" },
            ].map(({ table, label }) => {
              const row = data.business?.[table] || { d30: 0, d7: 0, d1: 0 };
              return (
                <StatCard
                  key={table}
                  label={label}
                  value={row.d30}
                  sub={`${fmt(row.d7)} last 7d · ${fmt(row.d1)} last 24h`}
                />
              );
            })}
          </div>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Capacity vs ceilings
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            {caps.map((c) => (
              <CapacityBar key={c.label} {...c} />
            ))}
          </div>

          <p className="mt-4 text-[11px] text-slate-400">
            Last refresh:{" "}
            {refreshedAt ? new Date(refreshedAt).toLocaleTimeString() : "—"} ·
            Storage bucket: <code className="text-slate-200">{data.storage?.bucket}</code>{" "}
            ({fmt(data.storage?.entries ?? 0)} root entries)
          </p>
        </>
      ) : (
        !loading && !error ? (
          <p className="mt-4 text-sm text-slate-400">No data yet.</p>
        ) : null
      )}
    </section>
  );
}
