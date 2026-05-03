"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const STATUS_BADGE_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-rose-100 text-rose-700",
  changes_requested: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  declined: "Declined",
  changes_requested: "Changes",
};

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount || 0);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function EstimatesPage() {
  const router = useRouter();
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [pipelineBusyId, setPipelineBusyId] = useState("");
  const [pendingStatusAction, setPendingStatusAction] = useState(null);
  const [selectedEstimate, setSelectedEstimate] = useState(null);

  const kanbanColumns = useMemo(() => {
    const cols = { draft: [], sent: [], changes_requested: [], approved: [], declined: [] };
    for (const estimate of estimates) {
      const s = String(estimate.status || "draft").toLowerCase();
      if (s in cols) cols[s].push(estimate);
    }
    for (const key of Object.keys(cols)) {
      cols[key].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime(),
      );
    }
    return cols;
  }, [estimates]);

  async function loadEstimates() {
    setLoading(true);
    try {
      const response = await apiFetch("/api/estimates", {
        suppressUnauthorizedEvent: true,
      });
      const payload = await getJsonOrThrow(response, "Unable to load estimates.");
      setEstimates(Array.isArray(payload?.data) ? payload.data : []);
    } catch (error) {
      setStatusMessage(error.message || "Unable to load estimates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEstimates();
  }, []);

  async function updateEstimateStatus(estimate, nextStatus) {
    if (!estimate?.id) return;
    setPipelineBusyId(estimate.id);
    try {
      const response = await apiFetch(`/api/estimates/${estimate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      await getJsonOrThrow(response, "Unable to update status.");
      await loadEstimates();
    } catch (error) {
      setStatusMessage(error.message || "Unable to update status.");
    } finally {
      setPipelineBusyId("");
    }
  }

  function queueStatusAction(estimate, nextStatus) {
    if (!estimate?.id) return;
    setPendingStatusAction({
      estimateId: estimate.id,
      estimateClientName: estimate.clientName || "this estimate",
      nextStatus,
    });
  }

  async function confirmPendingStatusAction() {
    if (!pendingStatusAction) return;
    const targetEstimate = estimates.find(
      (estimate) => estimate.id === pendingStatusAction.estimateId,
    );
    if (!targetEstimate) {
      setPendingStatusAction(null);
      return;
    }
    await updateEstimateStatus(targetEstimate, pendingStatusAction.nextStatus);
    setPendingStatusAction(null);
  }

  const KANBAN_COLS = [
    { key: "draft",             label: "Draft",    headerCls: "border-slate-300 bg-slate-50",    dotCls: "bg-slate-400" },
    { key: "sent",              label: "Sent",     headerCls: "border-blue-200 bg-blue-50",       dotCls: "bg-blue-500" },
    { key: "changes_requested", label: "Changes",  headerCls: "border-amber-200 bg-amber-50",    dotCls: "bg-amber-500" },
    { key: "approved",          label: "Approved", headerCls: "border-emerald-200 bg-emerald-50", dotCls: "bg-emerald-500" },
    { key: "declined",          label: "Declined", headerCls: "border-rose-200 bg-rose-50",       dotCls: "bg-rose-500" },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* ── Top bar ── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Estimates</h1>
          <p className="text-xs text-slate-500">Click a card to view details and take action</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadEstimates}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => router.push("/estimates/new")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            + New Estimate
          </button>
        </div>
      </div>

      {/* ── Kanban board + Detail panel ── */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Kanban board */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
            <div className="flex gap-3 h-full">
          {KANBAN_COLS.map((col) => {
            const cards = kanbanColumns[col.key] || [];
            return (
              <div key={col.key} className="flex w-60 flex-shrink-0 flex-col">
                {/* Column header */}
                <div className={`mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 ${col.headerCls}`}>
                  <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${col.dotCls}`} />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{col.label}</span>
                  <span className="ml-auto rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{cards.length}</span>
                </div>
                {/* Cards */}
                <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
                  {loading ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-400">Loading…</div>
                  ) : cards.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400">
                      No estimates
                    </div>
                  ) : (
                    cards.map((estimate) => (
                      <button
                        key={estimate.id}
                        type="button"
                        onClick={() => setSelectedEstimate(estimate)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-400 hover:shadow-md flex-shrink-0"
                      >
                        <div className="text-sm font-semibold text-slate-900 leading-tight">
                          {estimate.clientName || "Unnamed client"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 leading-tight line-clamp-1">
                          {estimate.address || "No address"}
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-800">
                          {formatMoney(estimate.total)}
                        </div>
                        <div className="mt-1.5 text-[10px] text-slate-400">
                          {estimate.updatedAt
                            ? new Date(estimate.updatedAt).toLocaleDateString()
                            : "—"}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
            </div>
          </div>
        </div>

        {/* ── Detail panel (responsive) ── */}
        {selectedEstimate ? (
          <div className="hidden lg:flex w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white shadow-lg">
            {/* Panel header */}
            <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3 flex-shrink-0">
              <div>
                <div className="text-sm font-bold text-slate-900">{selectedEstimate.clientName || "Unnamed client"}</div>
                <div className="mt-0.5 text-xs text-slate-500">{selectedEstimate.address || "No address"}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEstimate(null)}
                className="ml-2 mt-0.5 flex-shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
              {/* Status badge */}
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE_STYLES[String(selectedEstimate.status || "draft").toLowerCase()] || STATUS_BADGE_STYLES.draft}`}>
                {STATUS_LABELS[String(selectedEstimate.status || "draft").toLowerCase()] || "Draft"}
              </span>

              {/* Financials */}
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatMoney(selectedEstimate.subtotal ?? selectedEstimate.total)}</span>
                </div>
                {Number(selectedEstimate.tax || 0) > 0 ? (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Tax</span>
                    <span>{formatMoney(selectedEstimate.tax)}</span>
                  </div>
                ) : null}
                <div className="mt-1 flex justify-between text-sm font-bold text-slate-900">
                  <span>Total</span>
                  <span>{formatMoney(selectedEstimate.total)}</span>
                </div>
              </div>

              {/* Contact */}
              {selectedEstimate.clientEmail || selectedEstimate.clientPhone ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Client Contact</div>
                  {selectedEstimate.clientEmail ? (
                    <div className="text-xs text-slate-700">Email: {selectedEstimate.clientEmail}</div>
                  ) : null}
                  {selectedEstimate.clientPhone ? (
                    <div className="text-xs text-slate-700">Phone: {selectedEstimate.clientPhone}</div>
                  ) : null}
                </div>
              ) : null}

              {/* Services */}
              {Array.isArray(selectedEstimate.services) && selectedEstimate.services.length > 0 ? (
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Services</div>
                  <div className="space-y-1">
                    {selectedEstimate.services.map((service, idx) => (
                      <div key={service.id || idx} className="flex justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                        <span className="font-medium text-slate-800">{service.name}</span>
                        <span className="text-slate-600">{formatMoney(service.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Notes / Job description */}
              {selectedEstimate.notes ? (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Job Description</div>
                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap">{selectedEstimate.notes}</p>
                </div>
              ) : null}

              {/* Audit trail */}
              <div className="mt-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Timeline</div>
                <div className="space-y-1 text-[11px] text-slate-500">
                  {selectedEstimate.audit?.sentAt ? <div>Sent: {formatDateTime(selectedEstimate.audit.sentAt)}</div> : null}
                  {selectedEstimate.audit?.changesRequestedAt ? <div>Changes requested: {formatDateTime(selectedEstimate.audit.changesRequestedAt)}</div> : null}
                  {selectedEstimate.audit?.resentAt ? <div>Resent ({selectedEstimate.audit.resendCount}x): {formatDateTime(selectedEstimate.audit.resentAt)}</div> : null}
                  {selectedEstimate.audit?.approvedAt ? <div className="font-semibold text-emerald-600">Approved: {formatDateTime(selectedEstimate.audit.approvedAt)}</div> : null}
                  {selectedEstimate.audit?.declinedAt ? <div className="font-semibold text-rose-600">Declined: {formatDateTime(selectedEstimate.audit.declinedAt)}</div> : null}
                </div>
              </div>
            </div>

            {/* Panel actions */}
            <div className="border-t border-slate-200 px-4 py-3">
              {pendingStatusAction && pendingStatusAction.estimateId === selectedEstimate.id ? (
                <div className="rounded-xl border border-slate-300 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-700">
                    Move to {STATUS_LABELS[pendingStatusAction.nextStatus]}?
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await confirmPendingStatusAction();
                        setSelectedEstimate(null);
                      }}
                      className="flex-1 rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingStatusAction(null)}
                      className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => queueStatusAction(selectedEstimate, "approved")}
                    disabled={pipelineBusyId === selectedEstimate.id}
                    className="rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => queueStatusAction(selectedEstimate, "declined")}
                    disabled={pipelineBusyId === selectedEstimate.id}
                    className="rounded-lg bg-rose-600 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => queueStatusAction(selectedEstimate, "changes_requested")}
                    disabled={pipelineBusyId === selectedEstimate.id}
                    className="col-span-2 rounded-lg bg-amber-500 py-2 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-60"
                  >
                    Request Changes
                  </button>
                  {String(selectedEstimate.status || "").toLowerCase() === "changes_requested" ? (
                    <button
                      type="button"
                      onClick={() => { router.push(`/estimates/new?edit=${selectedEstimate.id}`); setSelectedEstimate(null); }}
                      className="col-span-2 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit Estimate
                    </button>
                  ) : null}
                </div>
              )}
              {/* Print + share link */}
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <a
                  href={`/estimate/${selectedEstimate.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  🔗 Client Link
                </a>
                <a
                  href={`/estimate/${selectedEstimate.id}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => { e.preventDefault(); const w = window.open(`/estimate/${selectedEstimate.id}`, "_blank"); w?.addEventListener("load", () => w.print()); }}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  🖨 Print / PDF
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex w-80 flex-shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50">
            <p className="text-center text-sm text-slate-400">Select an estimate to view details</p>
          </div>
        )}
      </div>

    </div>
  );
}
