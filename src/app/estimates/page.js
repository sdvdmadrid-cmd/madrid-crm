"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import ws from "@/styles/workspace-dark.module.css";
import est from "./estimates.module.css";

const STATUS_BADGE_STYLES = {
  draft: ws.badgeDraft,
  sent: ws.badgeSent,
  approved: ws.badgeApproved,
  declined: ws.badgeDeclined,
  changes_requested: ws.badgeChanges,
};

const COLUMN_HEADER_CLASS = {
  draft: est.columnHeaderDraft,
  sent: est.columnHeaderSent,
  changes_requested: est.columnHeaderChanges,
  approved: est.columnHeaderApproved,
  declined: est.columnHeaderDeclined,
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
  const [sendingEmailId, setSendingEmailId] = useState("");
  const [duplicatingId, setDuplicatingId] = useState("");

  // History for the currently-selected estimate (paquete J). We fetch it
  // on demand only when the detail panel is open, so the list view stays
  // light.
  const [revisions, setRevisions] = useState([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState("");

  useEffect(() => {
    if (!selectedEstimate?.id) {
      setRevisions([]);
      setRevisionsError("");
      return;
    }
    let cancelled = false;
    setRevisionsLoading(true);
    setRevisionsError("");
    apiFetch(`/api/estimates/${selectedEstimate.id}/revisions`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) {
          setRevisions(json.data);
        } else {
          setRevisions([]);
          setRevisionsError(String(json?.error || "Unable to load history"));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setRevisions([]);
        setRevisionsError(err?.message || "Unable to load history");
      })
      .finally(() => {
        if (!cancelled) setRevisionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstimate?.id]);

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

  async function duplicateEstimate(estimate) {
    if (!estimate?.id) return;
    setDuplicatingId(estimate.id);
    setStatusMessage("");
    try {
      const response = await apiFetch(`/api/estimates/${estimate.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await getJsonOrThrow(response, "Unable to duplicate estimate.");
      const newId = payload?.data?.id;
      const newNumber = payload?.data?.estimateNumber || "";
      setSelectedEstimate(null);
      setStatusMessage(
        newNumber
          ? `Duplicated as ${newNumber}. Opening for editing…`
          : "Duplicated. Opening for editing…",
      );
      if (newId) {
        router.push(`/estimates/new?edit=${newId}`);
      } else {
        await loadEstimates();
      }
    } catch (error) {
      setStatusMessage(error.message || "Unable to duplicate estimate.");
    } finally {
      setDuplicatingId("");
    }
  }

  async function sendEstimateEmail(estimate) {
    if (!estimate?.id) return;
    if (!estimate.clientEmail) {
      setStatusMessage("This estimate has no client email. Edit the estimate to add one.");
      return;
    }
    setSendingEmailId(estimate.id);
    setStatusMessage("");
    try {
      const response = await apiFetch(`/api/estimates/${estimate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "sent",
          sendChannels: { email: true, text: false },
          currentStatus: estimate.status || "draft",
        }),
      });
      await getJsonOrThrow(response, "Unable to send estimate.");
      setStatusMessage(`Estimate sent to ${estimate.clientEmail}`);
      await loadEstimates();
    } catch (error) {
      setStatusMessage(error.message || "Failed to send estimate.");
    } finally {
      setSendingEmailId("");
    }
  }

  const KANBAN_COLS = [
    { key: "draft", label: "Draft", dot: "#94a3b8" },
    { key: "sent", label: "Sent", dot: "#3b82f6" },
    { key: "changes_requested", label: "Changes", dot: "#f59e0b" },
    { key: "approved", label: "Approved", dot: "#10b981" },
    { key: "declined", label: "Declined", dot: "#f43f5e" },
  ];

  return (
    <div className={`${ws.page} ${ws.pageFullBleed}`}>
      <div className={ws.topBar}>
        <div>
          <h1 className={ws.title}>Estimates</h1>
          <p className={ws.subtitle}>Kanban pipeline — click a card for details and actions</p>
        </div>
        <div className={ws.actions}>
          <button type="button" onClick={loadEstimates} className={ws.btnSecondary}>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => router.push("/estimates/new")}
            className={ws.btnPrimary}
          >
            + New Estimate
          </button>
        </div>
      </div>

      {!selectedEstimate && statusMessage ? (
        <div className={ws.noticeInfo} style={{ margin: "12px 24px 0" }}>
          {statusMessage}
        </div>
      ) : null}

      <div className={est.kanbanWrap}>
        <div className={est.kanbanScroll}>
          <div className={est.kanbanRow}>
          {KANBAN_COLS.map((col) => {
            const cards = kanbanColumns[col.key] || [];
            return (
              <div key={col.key} className={est.column}>
                <div className={`${est.columnHeader} ${COLUMN_HEADER_CLASS[col.key] || ""}`}>
                  <span className={est.dot} style={{ background: col.dot }} />
                  <span className={est.columnLabel}>{col.label}</span>
                  <span className={est.columnCount}>{cards.length}</span>
                </div>
                <div className={est.cards}>
                  {loading ? (
                    <div className={est.emptyCol}>Loading…</div>
                  ) : cards.length === 0 ? (
                    <div className={est.emptyCol}>No estimates</div>
                  ) : (
                    cards.map((estimate) => (
                      <button
                        key={estimate.id}
                        type="button"
                        onClick={() => setSelectedEstimate(estimate)}
                        className={est.estimateCard}
                      >
                        <div className={est.cardClient}>
                          {estimate.clientName || "Unnamed client"}
                        </div>
                        <div className={est.cardAddress}>
                          {estimate.address || "No address"}
                        </div>
                        <div className={est.cardAmount}>{formatMoney(estimate.total)}</div>
                        <div className={est.cardDate}>
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

        {selectedEstimate ? (
          <>
            <div
              className={est.detailBackdrop}
              onClick={() => setSelectedEstimate(null)}
              aria-hidden="true"
            />
            <div className={est.detailPanel}>
              <div className={est.detailHeader}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>
                    {selectedEstimate.estimateNumber ? (
                      <span
                        style={{
                          marginRight: 6,
                          borderRadius: 6,
                          background: "rgba(51,65,85,0.8)",
                          padding: "2px 6px",
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#94a3b8",
                        }}
                      >
                        {selectedEstimate.estimateNumber}
                      </span>
                    ) : null}
                    {selectedEstimate.clientName || "Unnamed client"}
                  </div>
                  <div className={ws.subtitle}>{selectedEstimate.address || "No address"}</div>
                </div>
                <button type="button" onClick={() => setSelectedEstimate(null)} className={ws.btnSecondary}>
                  ✕
                </button>
              </div>

              <div className={est.detailBody}>
                <span
                  className={`${ws.badge} ${STATUS_BADGE_STYLES[String(selectedEstimate.status || "draft").toLowerCase()] || STATUS_BADGE_STYLES.draft}`}
                >
                  {STATUS_LABELS[String(selectedEstimate.status || "draft").toLowerCase()] || "Draft"}
                </span>

                <div className={est.detailBox}>
                  <div className={est.serviceRow}>
                    <span>Subtotal</span>
                    <span>{formatMoney(selectedEstimate.subtotal ?? selectedEstimate.total)}</span>
                  </div>
                  {Number(selectedEstimate.tax || 0) > 0 ? (
                    <div className={est.serviceRow} style={{ marginTop: 6 }}>
                      <span>Tax</span>
                      <span>{formatMoney(selectedEstimate.tax)}</span>
                    </div>
                  ) : null}
                  <div className={est.serviceRow} style={{ marginTop: 8, fontWeight: 800, color: "#f8fafc" }}>
                    <span>Total</span>
                    <span>{formatMoney(selectedEstimate.total)}</span>
                  </div>
                </div>

                {selectedEstimate.clientEmail || selectedEstimate.clientPhone ? (
                  <div className={est.detailBox}>
                    <div className={est.detailLabel}>Client contact</div>
                    {selectedEstimate.clientEmail ? (
                      <div style={{ fontSize: 12, color: "#cbd5e1" }}>Email: {selectedEstimate.clientEmail}</div>
                    ) : null}
                    {selectedEstimate.clientPhone ? (
                      <div style={{ fontSize: 12, color: "#cbd5e1" }}>Phone: {selectedEstimate.clientPhone}</div>
                    ) : null}
                  </div>
                ) : null}

                {Array.isArray(selectedEstimate.services) && selectedEstimate.services.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <div className={est.detailLabel}>Services</div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {selectedEstimate.services.map((service, idx) => (
                        <div key={service.id || idx} className={est.serviceRow}>
                          <span>{service.name}</span>
                          <span>{formatMoney(service.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedEstimate.notes ? (
                  <div style={{ marginTop: 12 }}>
                    <div className={est.detailLabel}>Job description</div>
                    <p
                      style={{
                        margin: 0,
                        borderRadius: 10,
                        border: "1px solid rgba(148,163,184,0.14)",
                        background: "rgba(15,23,42,0.65)",
                        padding: "10px 12px",
                        fontSize: 12,
                        color: "#cbd5e1",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {selectedEstimate.notes}
                    </p>
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <div className={est.detailLabel}>Timeline</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", display: "grid", gap: 4 }}>
                    {selectedEstimate.audit?.sentAt ? <div>Sent: {formatDateTime(selectedEstimate.audit.sentAt)}</div> : null}
                    {selectedEstimate.audit?.changesRequestedAt ? (
                      <div>Changes requested: {formatDateTime(selectedEstimate.audit.changesRequestedAt)}</div>
                    ) : null}
                    {selectedEstimate.audit?.resentAt ? (
                      <div>
                        Resent ({selectedEstimate.audit.resendCount}x):{" "}
                        {formatDateTime(selectedEstimate.audit.resentAt)}
                      </div>
                    ) : null}
                    {selectedEstimate.audit?.approvedAt ? (
                      <div style={{ color: "#6ee7b7", fontWeight: 600 }}>
                        Approved: {formatDateTime(selectedEstimate.audit.approvedAt)}
                      </div>
                    ) : null}
                    {selectedEstimate.audit?.declinedAt ? (
                      <div style={{ color: "#fda4af", fontWeight: 600 }}>
                        Declined: {formatDateTime(selectedEstimate.audit.declinedAt)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className={est.detailLabel}>History</div>
                  {revisionsLoading ? (
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>Loading history…</div>
                  ) : revisionsError ? (
                    <div style={{ fontSize: 11, color: "#fda4af" }}>{revisionsError}</div>
                  ) : revisions.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>No history yet.</div>
                  ) : (
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "grid",
                        gap: 6,
                        maxHeight: 220,
                        overflowY: "auto",
                      }}
                    >
                      {revisions.map((rev) => (
                        <li
                          key={rev.id}
                          style={{
                            border: "1px solid rgba(148,163,184,0.18)",
                            background: "rgba(15,23,42,0.4)",
                            borderRadius: 8,
                            padding: "6px 8px",
                            fontSize: 11,
                            color: "#cbd5e1",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 0.4 }}>
                              {String(rev.kind || "updated").replace(/_/g, " ")}
                            </span>
                            <span style={{ color: "#94a3b8" }}>{formatDateTime(rev.createdAt)}</span>
                          </div>
                          {rev.statusBefore && rev.statusAfter && rev.statusBefore !== rev.statusAfter ? (
                            <div style={{ marginTop: 2, color: "#94a3b8" }}>
                              {rev.statusBefore} → {rev.statusAfter}
                            </div>
                          ) : null}
                          {Number(rev.totalBefore) !== Number(rev.totalAfter) ? (
                            <div style={{ marginTop: 2, color: "#94a3b8" }}>
                              Total: {formatMoney(rev.totalBefore)} → {formatMoney(rev.totalAfter)}
                            </div>
                          ) : null}
                          {Object.keys(rev.changes || {}).length > 0 ? (
                            <div style={{ marginTop: 2, color: "#94a3b8" }}>
                              Changed: {Object.keys(rev.changes).join(", ")}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className={est.detailFooter}>
                {statusMessage ? <div className={ws.noticeInfo} style={{ marginBottom: 10 }}>{statusMessage}</div> : null}
                {pendingStatusAction && pendingStatusAction.estimateId === selectedEstimate.id ? (
                  <div className={est.detailBox}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
                      Move to {STATUS_LABELS[pendingStatusAction.nextStatus]}?
                    </div>
                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          await confirmPendingStatusAction();
                          setSelectedEstimate(null);
                        }}
                        className={ws.btnPrimary}
                        style={{ flex: 1 }}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingStatusAction(null)}
                        className={ws.btnSecondary}
                        style={{ flex: 1 }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => sendEstimateEmail(selectedEstimate)}
                      disabled={sendingEmailId === selectedEstimate.id}
                      className={ws.btnPrimary}
                      style={{ gridColumn: "1 / -1", opacity: sendingEmailId === selectedEstimate.id ? 0.6 : 1 }}
                    >
                      {sendingEmailId === selectedEstimate.id
                        ? "Sending…"
                        : selectedEstimate.audit?.sentAt
                          ? "✉ Resend to client"
                          : "✉ Send to client"}
                    </button>
                    <button
                      type="button"
                      onClick={() => queueStatusAction(selectedEstimate, "approved")}
                      disabled={pipelineBusyId === selectedEstimate.id}
                      className={ws.btnPrimary}
                    >
                      Approve
                    </button>
                    <button type="button" onClick={() => queueStatusAction(selectedEstimate, "declined")} className={ws.btnDanger}>
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => queueStatusAction(selectedEstimate, "changes_requested")}
                      className={ws.btnSecondary}
                      style={{ gridColumn: "1 / -1" }}
                    >
                      Request changes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/estimates/new?edit=${selectedEstimate.id}`);
                        setSelectedEstimate(null);
                      }}
                      className={ws.btnSecondary}
                      style={{ gridColumn: "1 / -1" }}
                    >
                      Edit estimate
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateEstimate(selectedEstimate)}
                      disabled={duplicatingId === selectedEstimate.id}
                      aria-label="Duplicate this estimate as a new draft"
                      className={ws.btnSecondary}
                      style={{
                        gridColumn: "1 / -1",
                        opacity: duplicatingId === selectedEstimate.id ? 0.6 : 1,
                      }}
                    >
                      {duplicatingId === selectedEstimate.id ? "Duplicating…" : "⎘ Duplicate"}
                    </button>
                  </div>
                )}
                <div style={{ marginTop: 12, display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                  <a
                    href={selectedEstimate.publicLink || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={ws.btnSecondary}
                    style={{ flex: 1, textAlign: "center", textDecoration: "none", opacity: selectedEstimate.publicLink ? 1 : 0.5, pointerEvents: selectedEstimate.publicLink ? "auto" : "none" }}
                  >
                    Client link
                  </a>
                  <a
                    href={selectedEstimate.publicLink || "#"}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      if (!selectedEstimate.publicLink) return;
                      const w = window.open(selectedEstimate.publicLink, "_blank");
                      w?.addEventListener("load", () => w.print());
                    }}
                    className={ws.btnSecondary}
                    style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
                  >
                    Print / PDF
                  </a>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
