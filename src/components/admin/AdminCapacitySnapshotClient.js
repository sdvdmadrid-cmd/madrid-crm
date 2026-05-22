"use client";

import { useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

export default function AdminCapacitySnapshotClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch("/api/admin/capacity");
        const payload = await getJsonOrThrow(response, "Unable to load capacity");
        if (!cancelled) {
          setData(payload?.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Unable to load capacity");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-slate-500">Loading platform capacity…</p>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Platform capacity</h3>
      <p className="mt-1 text-sm text-slate-600">
        How many contractors you can run today — based on live auth data, not a billing cap.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <dt className="text-xs font-semibold uppercase text-slate-500">Contractor accounts</dt>
          <dd className="mt-1 text-2xl font-bold text-slate-900">{data.contractorAccounts}</dd>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <dt className="text-xs font-semibold uppercase text-emerald-700">Active / paid</dt>
          <dd className="mt-1 text-2xl font-bold text-emerald-900">{data.activeContractors}</dd>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
          <dt className="text-xs font-semibold uppercase text-sky-700">On trial</dt>
          <dd className="mt-1 text-2xl font-bold text-sky-900">{data.trialContractors}</dd>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <dt className="text-xs font-semibold uppercase text-amber-700">Tenants (workspaces)</dt>
          <dd className="mt-1 text-2xl font-bold text-amber-900">{data.platformTenants}</dd>
        </div>
      </dl>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
        {(data.notes || []).map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
