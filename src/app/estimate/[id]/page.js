"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import SignaturePad from "@/components/SignaturePad";

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
  const searchParams = useSearchParams();
  const accessToken = String(searchParams.get("token") || "").trim();
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

  // Signature flow (paquete I). Driven by `estimate.signatureRequired`.
  // `signatureDraw` is an optional inline image data URL the customer
  // hand-draws into the SignaturePad below the typed name. The typed
  // name is still the canonical identifier; the drawing is supplementary
  // evidence the server records under audit.signature.dataUrl.
  const [showSignaturePanel, setShowSignaturePanel] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureAgreement, setSignatureAgreement] = useState(false);
  const [signatureDraw, setSignatureDraw] = useState("");

  useEffect(() => {
    if (!id) return;
    if (!accessToken) {
      setError("This estimate link is invalid or incomplete.");
      setLoading(false);
      return;
    }

    const query = new URLSearchParams({ token: accessToken });
    fetch(`/api/estimates/${id}/public?${query.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setEstimate(json.data);
          const edits = {};
          for (const s of json.data?.services || []) {
            edits[s.id || s.name] = { keep: true };
          }
          setItemEdits(edits);
        } else {
          setError(json.error || "Estimate not found.");
        }
      })
      .catch(() => setError("Failed to load estimate."))
      .finally(() => setLoading(false));
  }, [id, accessToken]);

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

  async function respond(
    action,
    {
      signatureName: sigName,
      signatureAgreement: sigAgreement,
      signatureDrawDataUrl: sigDraw,
    } = {},
  ) {
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
          token: accessToken,
          note: changesNote.trim(),
          ...(requestedItems !== null ? { requestedItems } : {}),
          ...(sigName ? { signatureName: sigName } : {}),
          ...(sigAgreement === true ? { signatureAgreement: true } : {}),
          ...(sigDraw ? { signatureDrawDataUrl: sigDraw } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEstimate((prev) => ({ ...prev, status: json.status }));
        setActionDone(action);
        setShowChangesPanel(false);
        setShowSignaturePanel(false);
      } else {
        // Server told us the customer must sign first — open the panel.
        if (json.signatureRequired) {
          setShowSignaturePanel(true);
        }
        setError(json.error || "Action failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  function handleApproveClick() {
    if (estimate?.signatureRequired) {
      setError("");
      setShowSignaturePanel(true);
      return;
    }
    respond("approved");
  }

  function handleConfirmSignature() {
    const trimmed = signatureName.trim();
    if (trimmed.length < 2 || !signatureAgreement) {
      setError("Type your full name and confirm you agree before signing.");
      return;
    }
    respond("approved", {
      signatureName: trimmed,
      signatureAgreement: true,
      // The drawn signature is optional — the server treats `typed` as
      // the canonical method when this is empty.
      signatureDrawDataUrl: signatureDraw || "",
    });
  }

  const status = estimate ? String(estimate.status || "draft").toLowerCase() : "";
  const canRespond = status === "sent";

  if (loading) {
    // Skeleton mirrors the loaded layout so the page doesn't jump on hydrate.
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="mx-auto max-w-2xl animate-pulse">
          <div className="mb-6 flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="h-6 w-40 rounded bg-slate-200" />
            </div>
            <div className="h-6 w-24 rounded-full bg-slate-200" />
          </div>
          <div className="mb-4 h-24 rounded-2xl border border-slate-200 bg-white" />
          <div className="mb-4 h-40 rounded-2xl border border-slate-200 bg-white" />
          <div className="h-32 rounded-2xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (error && !estimate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow text-center">
          <div className="text-lg font-bold text-slate-800">Estimate not found</div>
          <div className="mt-2 text-sm text-slate-500">{error}</div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const statusConf = STATUS_CONFIG[status] || STATUS_CONFIG.sent;
  const services = estimate?.services || [];

  const branding = estimate?.branding || {};
  const logoPlacement = branding.logoPlacement || "top_left";
  const logoAlignmentClass =
    logoPlacement === "top_right"
      ? "justify-end"
      : logoPlacement === "top_center"
        ? "justify-center"
        : "justify-start";

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 print:bg-white print:py-0">
      <div className="mx-auto max-w-2xl">
        {branding.logoUrl ? (
          <div className={`mb-4 flex ${logoAlignmentClass}`}>
            {/* Public-page branding header. Plain <img> avoids next/image
                config for arbitrary tenant CDN hosts and keeps the print
                view consistent. */}
            <img
              src={branding.logoUrl}
              alt={branding.companyName ? `${branding.companyName} logo` : "Company logo"}
              className="max-h-16 max-w-[240px] object-contain"
            />
          </div>
        ) : null}

        {/* Header */}
        <div className="mb-6 flex items-start justify-between print:mb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              {branding.companyName ? branding.companyName : "Estimate"}
            </div>
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
                    <span className="font-medium">{s.name || "-"}</span>
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

        {/* Signed evidence — surfaces the typed name + drawn signature
            back to the customer on already-approved estimates so they
            can confirm what they signed when they revisit the link. */}
        {estimate.signature?.name ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm mb-4 print:shadow-none">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Signed</div>
            <div className="text-base font-semibold text-slate-900" style={{ fontFamily: "'Brush Script MT','Comic Sans MS',cursive" }}>
              {estimate.signature.name}
            </div>
            {estimate.signature.signedAt ? (
              <div className="mt-1 text-xs text-slate-600">
                {new Date(estimate.signature.signedAt).toLocaleString()}
              </div>
            ) : null}
            {estimate.signature.dataUrl ? (
              <img
                src={estimate.signature.dataUrl}
                alt="Drawn signature"
                className="mt-3 max-h-32 rounded-lg border border-emerald-200 bg-white p-2"
              />
            ) : null}
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
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 text-sm transition min-h-[52px] ${kept ? "border-slate-200 bg-white" : "border-rose-200 bg-rose-50 opacity-60"}`}
                          >
                            <input
                              type="checkbox"
                              checked={kept}
                              onChange={() => toggleItem(key)}
                              className="h-5 w-5 rounded accent-emerald-600"
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
                    <div key={item.id} className="mb-2 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
                      <span className="flex-1 font-medium text-blue-800">{item.name}</span>
                      {item.price > 0 ? <span className="text-blue-600">{formatMoney(item.price)}</span> : null}
                      <button
                        type="button"
                        onClick={() => removeNewItem(idx)}
                        aria-label="Remove item"
                        className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-rose-500 hover:bg-rose-100 hover:text-rose-700 font-bold text-base leading-none"
                      >
                        ×
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
                    placeholder="Describe any other changes you'd like..."
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
                    {actionLoading ? "Sending..." : "Send Change Request"}
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
            ) : showSignaturePanel ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-sm font-semibold text-emerald-800">
                    Sign to approve
                  </div>
                  <div className="mt-1 text-xs text-emerald-700">
                    {Number.isFinite(Number(estimate?.signatureThreshold)) && Number(estimate?.signatureThreshold) > 0
                      ? `This estimate exceeds ${formatMoney(estimate.signatureThreshold)}. Please type your full legal name to confirm.`
                      : "Please type your full legal name to confirm."}
                  </div>
                </div>
                <label className="block text-xs font-semibold text-slate-600" htmlFor="signature-name">
                  Full name
                </label>
                <input
                  id="signature-name"
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Type your full name"
                  autoComplete="name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold tracking-wide text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                  style={{ fontFamily: "'Brush Script MT','Comic Sans MS',cursive" }}
                />
                <div className="mt-1">
                  <SignaturePad
                    value={signatureDraw}
                    onChange={setSignatureDraw}
                    label="Or draw your signature (optional)"
                    clearLabel="Clear"
                  />
                </div>
                <label className="flex min-h-[44px] items-start gap-3 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={signatureAgreement}
                    onChange={(e) => setSignatureAgreement(e.target.checked)}
                    className="mt-0.5 h-5 w-5 flex-shrink-0 cursor-pointer accent-emerald-600"
                    aria-label="I agree to the scope of work and total"
                  />
                  <span>
                    I agree to the scope of work and total shown above, and my typed name acts as my electronic
                    signature for this approval.
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmSignature}
                    disabled={actionLoading || signatureName.trim().length < 2 || !signatureAgreement}
                    className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {actionLoading ? "Signing..." : "Sign & Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignaturePanel(false);
                      setError("");
                    }}
                    disabled={actionLoading}
                    className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Back
                  </button>
                </div>
                {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleApproveClick}
                  disabled={actionLoading}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {actionLoading
                    ? "Processing..."
                    : estimate?.signatureRequired
                      ? "Approve & Sign"
                      : "Approve Estimate"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowChangesPanel(true)}
                  disabled={actionLoading}
                  className="w-full rounded-xl border border-amber-400 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                >
                  Request Changes / Modify Items
                </button>
                <button
                  type="button"
                  onClick={() => respond("declined")}
                  disabled={actionLoading}
                  className="w-full rounded-xl border border-rose-300 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                >
                  {actionLoading ? "Processing..." : "Decline Estimate"}
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
              {actionDone === "approved" ? "Estimate Approved!"
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

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 print:hidden">
          {accessToken ? (
            <a
              href={`/api/estimates/${id}/public/pdf?token=${encodeURIComponent(accessToken)}`}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Download PDF
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}


