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

  // Changes flow
  const [showChangesPanel, setShowChangesPanel] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  // item editing: { id -> { keep: bool, customLabel: string } }
  const [itemEdits, setItemEdits] = useState({});
  const [newItems, setNewItems] = useState([]); // [{label, price}]
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/estimates/${id}/public`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setEstimate(json.data);
          // init item edits: all kept by default
          const edits = {};
          for (const s of (json.data?.services || [])) {
            edits[s.id || s.name] = { keep: true };
          }
          setItemEdits(edits);
        } else {
          setError("Estimate not found.");
        }
      })
      .catch(() => setError("Failed to load estimate."))
      .finally(() => setLoading(false));
  }, [id]);

  function toggleItem(key) {
    setItemEdits((prev) => ({ ...prev, [key]: { keep: !prev[key]?.keep } }));
  }

  function addNewItem() {
    const label = newItemLabel.trim();
    if (!label) return;
    const price = Number(newItemPrice) || 0;
    setNewItems((prev) => [...prev, { id: `new-${Date.now()}`, name: label, qty: 1, unitPrice: price, price }]);
    setNewItemLabel("");
    setNewItemPrice("");
  }

  function removeNewItem(idx) {
    setNewItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function respond(action) {
    setActionLoading(true);
    setError("");
    try {
      let requestedItems = null;
      if (action === "changes_requested") {
        // Build requested items list: kept existing + new items
        const services = estimate?.services || [];
        requestedItems = [
          ...services.filter((s) => itemEdits[s.id || s.name]?.keep !== false),
          ...newItems,
        ];
      }

      const res = await fetch(`/api/estimates/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: changesNote.trim(),
          ...(requestedItems !== null ? { requestedItems } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEstimate((prev) => ({ ...prev, status: json.status }));
        setActionDone(action);
        setShowChangesPanel(false);
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
        <div className="text-sm text-slate-500">Loading estimateâ€¦</div>
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
  const services = estimate?.services || [];

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
        {services.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4 print:shadow-none">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Services</div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_60px_90px_80px] gap-2 border-b border-slate-100 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Total</span>
              </div>
              {services.map((s, i) => {
                const qty = Number(s.qty || 1);
                const unit = Number(s.unitPrice ?? s.price ?? 0);
                const total = Number(s.price ?? (qty * unit));
                return (
                  <div key={s.id || i} className="grid grid-cols-[1fr_60px_90px_80px] gap-2 text-sm text-slate-800">
                    <span className="font-medium">{s.name || "â€”"}</span>
                    <span className="text-right text-slate-600">{qty}</span>
                    <span className="text-right text-slate-600">{formatMoney(unit)}</span>
                    <span className="text-right font-semibold">{formatMoney(total)}</span>
                  </div>
                );
              })}
            </div>
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

            {showChangesPanel ? (
              <div>
                {/* Item checklist */}
                {services.length > 0 ? (
                  <div className="mb-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Keep / Remove Items
                    </div>
                    <div className="space-y-2">
                      {services.map((s) => {
                        const key = s.id || s.name;
                        const kept = itemEdits[key]?.keep !== false;
                        return (
                          <label
                            key={key}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${kept ? "border-slate-200 bg-white" : "border-rose-200 bg-rose-50 opacity-60"}`}
                          >
                            <input
                              type="checkbox"
                              checked={kept}
                              onChange={() => toggleItem(key)}
                              className="h-4 w-4 rounded accent-emerald-600"
                            />
                            <span className={`flex-1 font-medium ${kept ? "text-slate-800" : "text-rose-700 line-through"}`}>
                              {s.name}
                            </span>
                            <span className="text-slate-500">{formatMoney(s.price)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Add new items */}
                <div className="mb-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Add Items / Requests
                  </div>
                  {newItems.map((item, idx) => (
                    <div key={item.id} className="mb-2 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm">
                      <span className="flex-1 font-medium text-blue-800">{item.name}</span>
                      {item.price > 0 ? <span className="text-blue-600">{formatMoney(item.price)}</span> : null}
                      <button
                        type="button"
                        onClick={() => removeNewItem(idx)}
                        className="ml-2 text-rose-500 hover:text-rose-700 font-bold text-lg leading-none"
                      >
                        Ã—
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newItemLabel}
                      onChange={(e) => setNewItemLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addNewItem()}
                      placeholder="Item or request (e.g. Paint trim white)"
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                    <input
                      type="number"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      placeholder="$ (opt.)"
                      className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                    <button
                      type="button"
                      onClick={addNewItem}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Note */}
                <div className="mb-4">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Additional note (optional)</div>
                  <textarea
                    value={changesNote}
                    onChange={(e) => setChangesNote(e.target.value)}
                    placeholder="Describe any other changes you'd likeâ€¦"
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                {error ? <p className="mb-3 text-xs text-rose-600">{error}</p> : null}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => respond("changes_requested")}
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-60"
                  >
                    {actionLoading ? "Sendingâ€¦" : "Send Change Request"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangesPanel(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => respond("approved")}
                  disabled={actionLoading}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {actionLoading ? "Processingâ€¦" : "âœ“ Approve Estimate"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowChangesPanel(true)}
                  disabled={actionLoading}
                  className="w-full rounded-xl border border-amber-400 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                >
                  âœ Request Changes / Modify Items
                </button>
                <button
                  type="button"
                  onClick={() => respond("declined")}
                  disabled={actionLoading}
                  className="w-full rounded-xl border border-rose-300 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                >
                  {actionLoading ? "Processingâ€¦" : "âœ• Decline Estimate"}
                </button>
                {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
              </div>
            )}
          </div>
        ) : null}

        {/* Post-action confirmation */}
        {actionDone ? (
          <div className={`rounded-2xl border p-5 text-center print:hidden ${
            actionDone === "approved"
              ? "border-emerald-200 bg-emerald-50"
              : actionDone === "declined"
              ? "border-rose-200 bg-rose-50"
              : "border-amber-200 bg-amber-50"
          }`}>
            <div className={`text-lg font-bold ${
              actionDone === "approved" ? "text-emerald-700"
              : actionDone === "declined" ? "text-rose-700"
              : "text-amber-700"
            }`}>
              {actionDone === "approved" ? "âœ“ Estimate Approved!"
                : actionDone === "declined" ? "Estimate Declined"
                : "Changes Requested"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {actionDone === "approved"
                ? "We'll be in touch soon to schedule the work."
                : actionDone === "declined"
                ? "We've received your response. Thank you for letting us know."
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
            ðŸ–¨ Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}


