"use client";

import { useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["delivered", "opened", "clicked", "sent"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (["failed", "bounced", "complained"].includes(normalized)) {
    return "bg-rose-100 text-rose-700";
  }
  if (["pending", "queued", "processing"].includes(normalized)) {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-slate-100 text-slate-700";
}

export default function AdminEmailDeliveryClient() {
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadLogs = async (targetEmail = "") => {
    setLoading(true);
    setError("");
    try {
      const queryEmail = String(targetEmail || "").trim().toLowerCase();
      const url = queryEmail
        ? `/api/admin/email-logs?email=${encodeURIComponent(queryEmail)}&limit=25`
        : "/api/admin/email-logs?limit=25";
      const response = await apiFetch(url, { suppressUnauthorizedEvent: true });
      const payload = await getJsonOrThrow(response, "Unable to load email logs");
      setRows(Array.isArray(payload?.data?.rows) ? payload.data.rows : []);
    } catch (err) {
      setError(err?.message || "Unable to load email logs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs("");
  }, []);

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Verification Email Delivery
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Search signup verification attempts and see provider status, webhook updates, and message IDs.
        </p>
      </div>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              loadLogs(email);
            }
          }}
          placeholder="Search by recipient email"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => loadLogs(email)}
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading..." : "Search"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEmail("");
            loadLogs("");
          }}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Recent
        </button>
      </div>

      {error ? (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Recipient</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Event</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Provider</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Message ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Last Event</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-800">
                  <div className="font-medium text-slate-900">{row.recipient || "-"}</div>
                  <div className="text-xs text-slate-500">Created {formatDateTime(row.createdAt)}</div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{row.eventType || "-"}</td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(row.status)}`}>
                    {row.status || "unknown"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{row.provider || "-"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.providerMessageId || "-"}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{formatDateTime(row.lastEventAt || row.updatedAt)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{row.error || "-"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={7}>
                  {loading ? "Loading email logs..." : "No verification email logs found."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}