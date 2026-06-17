"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-auth";
import { isClientLoggedOut } from "@/lib/auth-logout-guard.js";

const REFRESH_MS = 60_000;

function formatWhen(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function relativeWhen(value) {
  if (!value) return "No login yet";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatWhen(value);
}

function bucketTone(bucket) {
  if (bucket === "today") return "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30";
  if (bucket === "week") return "bg-sky-500/20 text-sky-200 ring-sky-400/30";
  if (bucket === "month") return "bg-amber-500/20 text-amber-100 ring-amber-400/30";
  if (bucket === "older") return "bg-slate-500/20 text-slate-200 ring-slate-400/30";
  return "bg-rose-500/20 text-rose-100 ring-rose-400/30";
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function OwnerLoginActivityClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = useCallback(async () => {
    if (isClientLoggedOut()) return;
    setError("");
    try {
      const res = await apiFetch("/api/owner/login-activity", { cache: "no-store" });
      if (!res.ok) {
        setError(`Login activity unavailable (${res.status})`);
        return;
      }
      const payload = await res.json();
      if (!payload?.success) {
        setError(payload?.error || "Unable to load login activity");
        return;
      }
      setData(payload.data || null);
      setRefreshedAt(new Date());
    } catch (err) {
      setError(err?.message || "Unable to load login activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isClientLoggedOut()) return undefined;
    load();
    const timer = setInterval(() => {
      if (!isClientLoggedOut()) {
        load();
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    if (filter === "today") {
      return rows.filter((row) => row.activityBucket === "today");
    }
    if (filter === "week") {
      return rows.filter((row) => ["today", "week"].includes(row.activityBucket));
    }
    if (filter === "never") {
      return rows.filter((row) => row.activityBucket === "never");
    }
    return rows;
  }, [data, filter]);

  const summary = data?.summary;

  return (
    <div
      className="rounded-2xl border border-white/10 p-5 text-white"
      style={{
        background:
          "linear-gradient(160deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.85) 100%)",
      }}
      data-testid="owner-login-activity"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Contractor login activity</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">
            Who has entered the app — last sign-in from Supabase Auth across real
            contractor accounts (test/probe accounts excluded).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-white/10"
          >
            Refresh
          </button>
          <Link
            href="/owner/tenants"
            className="rounded-lg border border-indigo-400/30 bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/30"
          >
            Tenant command center
          </Link>
        </div>
      </div>

      {loading && !data ? (
        <p className="mt-4 text-sm text-slate-400">Loading login activity…</p>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Contractors"
            value={summary.contractorAccounts}
            hint={`${summary.probeAccounts} probe/test hidden`}
          />
          <StatCard label="Today" value={summary.loggedInLast24h} hint="Last 24 hours" />
          <StatCard label="This week" value={summary.loggedInLast7d} hint="Last 7 days" />
          <StatCard label="MAU" value={summary.mau30d} hint="Active last 30 days" />
          <StatCard label="Never logged in" value={summary.neverLoggedIn} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          ["all", "All"],
          ["today", "Today"],
          ["week", "This week"],
          ["never", "Never"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
              filter === value
                ? "bg-white/15 text-white ring-white/25"
                : "bg-black/20 text-slate-300 ring-white/10 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
        {refreshedAt ? (
          <span className="text-[11px] text-slate-500">
            Updated {refreshedAt.toLocaleTimeString()}
          </span>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-black/30 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Contractor</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Last login</th>
              <th className="px-4 py-3 font-semibold">Activity</th>
              <th className="px-4 py-3 font-semibold">Account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No contractors match this filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.email || "—"}</div>
                    {row.name ? (
                      <div className="text-xs text-slate-400">{row.name}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{row.companyName || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">
                      {relativeWhen(row.lastLoginAt)}
                    </div>
                    <div className="text-xs text-slate-500">{formatWhen(row.lastLoginAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${bucketTone(row.activityBucket)}`}
                    >
                      {row.activityLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {row.status}
                    {row.createdAt ? (
                      <div>Joined {formatWhen(row.createdAt).split(",")[0]}</div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
