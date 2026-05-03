"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

function formatMoney(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const STATUS_CONFIG = {
  draft:              { label: "Draft",            cls: "bg-slate-100 text-slate-700" },
  sent:               { label: "Pending Review",   cls: "bg-blue-100 text-blue-700" },
  approved:           { label: "Approved",         cls: "bg-emerald-100 text-emerald-700" },
  declined:           { label: "Declined",         cls: "bg-rose-100 text-rose-700" },
  changes_requested:  { label: "Changes Requested", cls: "bg-amber-100 text-amber-700" },
};

export default function EstimateClientPage() {
  const { id } = useParams();
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionDone, setActionDone] = useState("");
  const [changesNote, setChangesNote] = useState("");
  const [showChangesInput, setShowChangesInput] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/estimates/${id}/public`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEstimate(json.data);
        else setError("Estimate not found.");
      })
      .catch(() => setError("Failed to load estimate."))
      .finally(() => setLoading(false));
  }, [id]);

  async function respond(action) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/estimates/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: changesNote.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setEstimate((prev) => ({ ...prev, status: json.status }));
        setActionDone(action);
      } else {
        setError(json.error || "Action failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  const status = estimate ? String(estimate.status || "draft").toLowerCase() : "";
  const canRespond = status === "sent";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading estimate…</div>
      </div>
    );
  }

  if (error && !estimate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl bg-white p-8 shadow text-center">
          <div className="text-lg font-bold text-slate-800">Estimate not found</div>
          <div className="mt-2 text-sm text-slate-500">{error}</div>
        </div>
      </div>
    );
  }

  const statusConf = STATUS_CONFIG[status] || STATUS_CONFIG.sent;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 print:bg-white print:py-0">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between print:mb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Estimate</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {estimate.estimateNumber || `#${id.slice(-6).toUpperCase()}`}
            </h1>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusConf.cls}`}>
            {statusConf.label}
          </span>
        </div>

        {/* Client + address */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4 print:shadow-none">
          <div className="text-sm font-semibold text-slate-900">{estimate.clientName}</div>
          {estimate.clientPhone ? (
            <div className="mt-1 text-sm text-slate-500">Phone: {estimate.clientPhone}</div>
          ) : null}
          {estimate.clientEmail ? (
            <div className="mt-1 text-sm text-slate-500">Email: {estimate.clientEmail}</div>
          ) : null}
          {estimate.address ? (
            <div className="mt-1 text-sm text-slate-500">{estimate.address}</div>
          ) : null}
        </div>

        {/* Line items */}
        {Array.isArray(estimate.services) && estimate.services.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4 print:shadow-none">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Services</div>
            <div className="space-y-2">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_60px_90px_80px] gap-2 border-b border-slate-100 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Total</span>
              </div>
              {estimate.services.map((s, i) => {
                const qty = Number(s.qty || 1);
                const unit = Number(s.unitPrice ?? s.price ?? 0);
                const total = Number(s.price ?? (qty * unit));
                return (
                  <div key={s.id || i} className="grid grid-cols-[1fr_60px_90px_80px] gap-2 text-sm text-slate-800">
                    <span className="font-medium">{s.name || "—"}</span>
                    <span className="text-right text-slate-600">{qty}</span>
                    <span className="text-right text-slate-600">{formatMoney(unit)}</span>
                    <span className="text-right font-semibold">{formatMoney(total)}</span>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="mt-4 border-t border-slate-100 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatMoney(estimate.subtotal)}</span>
              </div>
              {Number(estimate.tax) > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span>
                  <span>{formatMoney(estimate.tax)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Total</span>
                <span>{formatMoney(estimate.total)}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Job description */}
        {estimate.notes ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4 print:shadow-none">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Scope of Work</div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{estimate.notes}</p>
          </div>
        ) : null}

        {/* Client actions */}
        {canRespond && !actionDone ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4 print:hidden">
            <div className="mb-3 text-sm font-semibold text-slate-800">Your response</div>
            {showChangesInput ? (
              <div className="mb-3">
                <textarea
                  value={changesNote}
                  onChange={(e) => setChangesNote(e.target.value)}
                  placeholder="Describe what changes you'd like…"
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => respond("changes_requested")}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-60"
                  >
                    {actionLoading ? "Sending…" : "Send Change Request"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangesInput(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => respond("approved")}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {actionLoading ? "Processing…" : "✓ Approve Estimate"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowChangesInput(true)}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl border border-amber-400 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                >
                  Request Changes
                </button>
              </div>
            )}
            {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
          </div>
        ) : null}

        {/* Post-action confirmation */}
        {actionDone ? (
          <div className={`rounded-2xl border p-5 text-center print:hidden ${
            actionDone === "approved"
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}>
            <div className={`text-lg font-bold ${actionDone === "approved" ? "text-emerald-700" : "text-amber-700"}`}>
              {actionDone === "approved" ? "✓ Estimate Approved!" : "Changes Requested"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {actionDone === "approved"
                ? "We'll be in touch soon to schedule the work."
                : "We'll review your notes and send an updated estimate."}
            </div>
          </div>
        ) : null}

        {/* Print button */}
        <div className="mt-6 text-center print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            🖨 Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}
