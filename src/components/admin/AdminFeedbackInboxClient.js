"use client";

import { useMemo, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const STATUS_OPTIONS = ["all", "new", "reviewed", "resolved"];
const TYPE_OPTIONS = ["all", "suggestion", "issue", "improvement"];

function badgeClasses(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "resolved") return "bg-emerald-100 text-emerald-700";
  if (normalized === "reviewed") return "bg-sky-100 text-sky-700";
  return "bg-amber-100 text-amber-700";
}

export default function AdminFeedbackInboxClient({ initialRows, tenants }) {
  const [rows, setRows] = useState(Array.isArray(initialRows) ? initialRows : []);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [savingId, setSavingId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedFeedbackId, setSelectedFeedbackId] = useState(
    Array.isArray(initialRows) && initialRows.length > 0 ? initialRows[0].id : "",
  );
  const [notice, setNotice] = useState("");

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === "all" || String(row.status || "").toLowerCase() === statusFilter;
      const matchesType =
        typeFilter === "all" || String(row.feedback_type || "").toLowerCase() === typeFilter;
      const matchesTenant = tenantFilter === "all" || String(row.user_id || "") === tenantFilter;
      const matchesSearch =
        !term ||
        String(row.userEmail || "").toLowerCase().includes(term) ||
        String(row.companyName || "").toLowerCase().includes(term) ||
        String(row.message || "").toLowerCase().includes(term) ||
        String(row.current_page || "").toLowerCase().includes(term);
      return matchesStatus && matchesType && matchesTenant && matchesSearch;
    });
  }, [rows, search, statusFilter, typeFilter, tenantFilter]);

  const filteredSummary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.newCount += row.status === "new" ? 1 : 0;
        acc.reviewed += row.status === "reviewed" ? 1 : 0;
        acc.resolved += row.status === "resolved" ? 1 : 0;
        return acc;
      },
      { total: 0, newCount: 0, reviewed: 0, resolved: 0 },
    );
  }, [filteredRows]);

  const selectedFeedback = useMemo(() => {
    return filteredRows.find((row) => row.id === selectedFeedbackId) || filteredRows[0] || null;
  }, [filteredRows, selectedFeedbackId]);

  async function updateFeedbackStatus(id, status) {
    setSavingId(id);
    try {
      const response = await apiFetch(`/api/platform/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await getJsonOrThrow(response, "Unable to update feedback.");
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, ...payload.data } : row)),
      );
      setNotice(`Feedback marked as ${status}.`);
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Private Feedback Inbox
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Only visible to you as super admin. Review, search, and resolve feedback across all accounts.
        </p>
      </div>

      <div className="grid gap-3 border-b border-slate-200 bg-white p-4 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] xl:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email, company, page, or message..."
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All statuses" : option}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All types" : option}
            </option>
          ))}
        </select>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm md:min-w-56"
        >
          <option value="all">All tenants</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Visible feedback</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{filteredSummary.total}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">New</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{filteredSummary.newCount}</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">Reviewed</p>
          <p className="mt-1 text-2xl font-semibold text-sky-900">{filteredSummary.reviewed}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Resolved</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{filteredSummary.resolved}</p>
        </div>
      </div>

      {notice ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid xl:grid-cols-[minmax(0,1.45fr)_420px]">
        <div className="overflow-x-auto border-b border-slate-200 xl:border-b-0 xl:border-r xl:border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Page</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Message</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Actions</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer hover:bg-slate-50 ${selectedFeedback?.id === row.id ? "bg-slate-50" : ""}`}
                  onClick={() => setSelectedFeedbackId(row.id)}
                >
                  <td className="px-4 py-3 text-sm text-slate-800">
                    <div className="font-medium text-slate-900">{row.userEmail || row.user_id || "-"}</div>
                    <div className="text-xs text-slate-500">{row.companyName || "No company"}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.feedback_type}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{row.current_page || "-"}</td>
                  <td className="max-w-xl px-4 py-3 text-sm text-slate-700">
                    <div className="line-clamp-2 max-w-md">{row.message}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingId === row.id || row.status === "reviewed"}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateFeedbackStatus(row.id, "reviewed");
                        }}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        disabled={savingId === row.id || row.status === "resolved"}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateFeedbackStatus(row.id, "resolved");
                        }}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={7}>
                    No feedback matches current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <aside className="bg-slate-50/70 p-4">
          {selectedFeedback ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Feedback detail</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{selectedFeedback.feedback_type}</h3>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses(selectedFeedback.status)}`}>
                  {selectedFeedback.status}
                </span>
              </div>

              <div className="space-y-4 text-sm text-slate-700">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Submitted by</p>
                  <p className="mt-1 font-medium text-slate-900">{selectedFeedback.userEmail || selectedFeedback.user_id || "-"}</p>
                  <p className="text-slate-500">{selectedFeedback.companyName || "No company"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Page</p>
                  <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{selectedFeedback.current_page || "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Message</p>
                  <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 whitespace-pre-wrap leading-6 text-slate-800">
                    {selectedFeedback.message}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</p>
                    <p className="mt-1">{selectedFeedback.created_at ? new Date(selectedFeedback.created_at).toLocaleString() : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Feedback ID</p>
                    <p className="mt-1 font-mono text-xs text-slate-600">{selectedFeedback.id}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={savingId === selectedFeedback.id || selectedFeedback.status === "reviewed"}
                  onClick={() => updateFeedbackStatus(selectedFeedback.id, "reviewed")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  disabled={savingId === selectedFeedback.id || selectedFeedback.status === "resolved"}
                  onClick={() => updateFeedbackStatus(selectedFeedback.id, "resolved")}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mark resolved
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
              Select a feedback item to see the full message and update status.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}