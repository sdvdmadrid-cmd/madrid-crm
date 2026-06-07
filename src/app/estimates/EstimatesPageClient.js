"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { filterAndRankRecords } from "@/lib/record-search";
import {
  getClientsListMeta,
  normalizeClientsListPayload,
} from "@/lib/clients-list-response";
import DocumentPdfActions from "@/components/workspace/DocumentPdfActions";
import "@/i18n";
import {
  escapeHtml,
  openPrintableHtmlDocument,
} from "@/lib/print-html-document";
import ws from "@/styles/workspace-dark.module.css";
import est from "./estimates.module.css";

const ESTIMATES_UI_PAGE_SIZE = 50;

function isTestEstimate(estimate) {
  const name = String(estimate?.clientName || "");
  const email = String(estimate?.clientEmail || "");
  return (
    /^(E2E|EB Lock)\b/i.test(name) ||
    /\be2e\b/i.test(name) ||
    /e2e\.client\+/i.test(email)
  );
}

function estimateMatchesClient(estimate, clientId) {
  const id = String(clientId || "").trim();
  if (!id) return true;
  return String(estimate?.clientUuid || "").trim() === id;
}

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

export default function EstimatesPageClient({ initialList = null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterClientId = String(searchParams.get("clientId") || "").trim();
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hideTestData, setHideTestData] = useState(true);
  const [estimates, setEstimates] = useState(initialList?.data ?? []);
  const [loading, setLoading] = useState(!initialList);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listPage, setListPage] = useState(initialList?.page ?? 1);
  const [listTotal, setListTotal] = useState(initialList?.total ?? 0);
  const [statusMessage, setStatusMessage] = useState("");
  const [pipelineBusyId, setPipelineBusyId] = useState("");
  const [pendingStatusAction, setPendingStatusAction] = useState(null);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [sendingEmailId, setSendingEmailId] = useState("");
  const [duplicatingId, setDuplicatingId] = useState("");
  const [convertingId, setConvertingId] = useState("");

  // Contract generation modal state. Surfaces a small inline form so the
  // contractor can pick a category before we POST to the contract endpoint.
  const [contractEstimate, setContractEstimate] = useState(null);
  const [contractCategory, setContractCategory] = useState("Service");
  const [contractOption, setContractOption] = useState("");
  const [contractLanguage, setContractLanguage] = useState("en");
  const [contractBusy, setContractBusy] = useState(false);
  const [contractPrintBody, setContractPrintBody] = useState("");
  const [contractSavedId, setContractSavedId] = useState("");
  const [contractMessage, setContractMessage] = useState("");
  // Ref-tracked auto-dismiss timer so we can clear it on unmount and on
  // re-open. Previously a bare `setTimeout` would fire after the panel
  // closed manually and write state on an unmounted component.
  const contractDismissTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (contractDismissTimer.current) {
        clearTimeout(contractDismissTimer.current);
        contractDismissTimer.current = null;
      }
    };
  }, []);

  async function generateContract() {
    if (!contractEstimate?.id || contractBusy) return;
    setContractBusy(true);
    setContractMessage("");
    if (contractDismissTimer.current) {
      clearTimeout(contractDismissTimer.current);
      contractDismissTimer.current = null;
    }
    try {
      const res = await apiFetch(`/api/estimates/${contractEstimate.id}/contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: contractCategory || "Service",
          option: contractOption || "",
          language: contractLanguage || "en",
          persist: true,
        }),
      });
      const payload = await getJsonOrThrow(res, "Unable to generate contract.");
      const contractId = payload?.data?.contract?.id;
      const bodyText = String(payload?.data?.body || "").trim();
      setContractPrintBody(bodyText);
      setContractSavedId(contractId ? String(contractId) : "");
      setContractMessage(
        contractId
          ? `Contract saved (${String(contractId).slice(0, 8)}). Print below or open Contracts in the menu.`
          : "Contract draft saved.",
      );
      // Auto-dismiss only when no persisted contract id (draft preview).
      if (!contractId) {
        contractDismissTimer.current = setTimeout(() => {
          setContractEstimate(null);
          setContractMessage("");
          contractDismissTimer.current = null;
        }, 6000);
      }
    } catch (err) {
      setContractMessage(err?.message || "Unable to generate contract.");
    } finally {
      setContractBusy(false);
    }
  }

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

  const filteredEstimates = useMemo(() => {
    let list = estimates;

    if (filterClientId) {
      list = list.filter((row) => estimateMatchesClient(row, filterClientId));
    }

    if (hideTestData) {
      list = list.filter((row) => !isTestEstimate(row));
    }

    if (statusFilter !== "all") {
      list = list.filter(
        (row) => String(row.status || "draft").toLowerCase() === statusFilter,
      );
    }

    if (filterQuery.trim()) {
      list = filterAndRankRecords(list, filterQuery, (row) => [
        row.clientName,
        row.estimateNumber,
        row.address,
        row.clientEmail,
        row.clientPhone,
      ]);
    }

    return list;
  }, [estimates, filterClientId, filterQuery, hideTestData, statusFilter]);

  const kanbanColumns = useMemo(() => {
    const cols = { draft: [], sent: [], changes_requested: [], approved: [], declined: [] };
    for (const estimate of filteredEstimates) {
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
  }, [filteredEstimates]);

  const totalVisible = useMemo(
    () => Object.values(kanbanColumns).reduce((sum, col) => sum + col.length, 0),
    [kanbanColumns],
  );

  const fetchEstimates = useCallback(async ({ page = 1, append = false } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const response = await apiFetch(
        `/api/estimates?limit=${ESTIMATES_UI_PAGE_SIZE}&page=${page}`,
        { suppressUnauthorizedEvent: true },
      );
      const payload = await getJsonOrThrow(response, "Unable to load estimates.");
      const batch = normalizeClientsListPayload(payload);
      const meta = getClientsListMeta(payload, batch.length);
      setListPage(meta.page);
      setListTotal(meta.total);
      setEstimates((prev) => {
        const next = append ? [...prev, ...batch] : batch;
        setSelectedEstimate((selected) => {
          if (!selected?.id) return selected;
          const fresh = next.find((row) => row.id === selected.id);
          return fresh || selected;
        });
        return next;
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to load estimates.");
      if (!append) setEstimates([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMoreEstimates = useCallback(() => {
    if (loading || loadingMore || estimates.length >= listTotal) return;
    fetchEstimates({ page: listPage + 1, append: true });
  }, [estimates.length, fetchEstimates, listPage, listTotal, loading, loadingMore]);

  const loadEstimates = useCallback(() => {
    fetchEstimates({ page: 1, append: false });
  }, [fetchEstimates]);

  useEffect(() => {
    if (initialList) return;
    fetchEstimates();
  }, [fetchEstimates, initialList]);

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

  async function convertEstimateToJob(estimate) {
    if (!estimate?.id) return;
    setConvertingId(estimate.id);
    setStatusMessage("");
    try {
      const response = await apiFetch(
        `/api/estimates/${estimate.id}/convert-to-job`,
        { method: "POST" },
      );
      const payload = await getJsonOrThrow(
        response,
        "Unable to convert estimate to a job.",
      );
      const jobId = payload?.data?.jobId;
      if (jobId) {
        router.push(`/jobs?jobId=${encodeURIComponent(jobId)}`);
        setSelectedEstimate(null);
        void loadEstimates();
      } else {
        await loadEstimates();
        setStatusMessage("Job created. Open Jobs to schedule and complete the work.");
      }
    } catch (error) {
      setStatusMessage(error.message || "Unable to convert estimate to a job.");
    } finally {
      setConvertingId("");
    }
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
    <main className={`${ws.page} ${ws.pageFullBleed}`}>
      <div className={ws.topBar}>
        <div>
          <h1 className={ws.title}>{t("estimatesPage.title")}</h1>
          <p className={ws.subtitle}>{t("estimatesPage.subtitle")}</p>
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

      <div className={est.toolbar}>
        <input
          type="search"
          className={est.toolbarSearch}
          placeholder="Search client, estimate #, address, email…"
          value={filterQuery}
          onChange={(event) => setFilterQuery(event.target.value)}
          aria-label="Search estimates"
        />
        <select
          className={est.toolbarSelect}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="changes_requested">Changes requested</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
        </select>
        <label className={est.toolbarCheck}>
          <input
            type="checkbox"
            checked={hideTestData}
            onChange={(event) => setHideTestData(event.target.checked)}
            aria-label="Hide test data"
          />
          Hide test data
        </label>
        {filterClientId ? (
          <button
            type="button"
            className={ws.btnSecondary}
            onClick={() => router.push("/estimates")}
          >
            Clear client filter
          </button>
        ) : null}
        <span className={est.toolbarMeta}>
          {loading
            ? "Loading…"
            : `${totalVisible} shown${listTotal > estimates.length ? ` · ${estimates.length}/${listTotal}` : ""}`}
          {filterClientId ? " · filtered by client" : ""}
        </span>
      </div>

      {filterClientId ? (
        <div className={ws.noticeInfo} style={{ margin: "0 16px 8px" }}>
          Showing estimates linked to this client only.
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
                        onClick={() => {
                          setContractEstimate(null);
                          setContractPrintBody("");
                          setContractSavedId("");
                          setContractMessage("");
                          setSelectedEstimate(estimate);
                        }}
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

        {estimates.length < listTotal && !loading ? (
          <div style={{ padding: "16px 24px", textAlign: "center" }}>
            <button
              type="button"
              className={ws.btnSecondary}
              onClick={loadMoreEstimates}
              disabled={loadingMore}
            >
              {loadingMore
                ? "Loading…"
                : t("estimatesPage.loadMore", { defaultValue: "Load more" })}
            </button>
          </div>
        ) : null}

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
                <button
                  type="button"
                  onClick={() => setSelectedEstimate(null)}
                  className={ws.btnSecondary}
                  aria-label="Close estimate details"
                >
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
                    {selectedEstimate.audit?.signature?.name ? (
                      <div style={{ color: "#e2e8f0" }}>
                        Signed by{" "}
                        <span style={{ fontStyle: "italic", fontFamily: "'Brush Script MT','Comic Sans MS',cursive", color: "#86efac" }}>
                          {selectedEstimate.audit.signature.name}
                        </span>
                        {selectedEstimate.audit.signature.signedAt
                          ? ` · ${formatDateTime(selectedEstimate.audit.signature.signedAt)}`
                          : ""}
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
                          {rev.actorLabel ? (
                            <div style={{ marginTop: 2, color: "#cbd5e1", fontStyle: "italic" }}>
                              by {rev.actorLabel}
                            </div>
                          ) : null}
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
                {selectedEstimate.status === "approved" && selectedEstimate.jobId ? (
                  <div className={est.linkedJobRow}>
                    Linked to job.{" "}
                    <Link
                      href={`/jobs?jobId=${encodeURIComponent(selectedEstimate.jobId)}`}
                      style={{ color: "#6ee7b7", fontWeight: 600 }}
                    >
                      Open job →
                    </Link>
                  </div>
                ) : null}
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
                  <>
                    {selectedEstimate.status === "approved" && !selectedEstimate.jobId ? (
                      <button
                        type="button"
                        onClick={() => convertEstimateToJob(selectedEstimate)}
                        disabled={convertingId === selectedEstimate.id}
                        className={`${ws.btnPrimary} ${est.convertJobBtn}`}
                        data-testid="convert-estimate-to-job"
                      >
                        {convertingId === selectedEstimate.id
                          ? "Creating job…"
                          : "Convert to Job"}
                      </button>
                    ) : null}
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
                      <button
                        type="button"
                        onClick={() => queueStatusAction(selectedEstimate, "declined")}
                        className={ws.btnDanger}
                      >
                        Decline
                      </button>
                    </div>
                    <details className={est.moreActions}>
                      <summary>More actions</summary>
                      <div className={est.moreActionsBody}>
                        <button
                          type="button"
                          onClick={() => queueStatusAction(selectedEstimate, "changes_requested")}
                          className={ws.btnSecondary}
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
                        >
                          Edit estimate
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateEstimate(selectedEstimate)}
                          disabled={duplicatingId === selectedEstimate.id}
                          aria-label="Duplicate this estimate as a new draft"
                          className={ws.btnSecondary}
                          style={{ opacity: duplicatingId === selectedEstimate.id ? 0.6 : 1 }}
                        >
                          {duplicatingId === selectedEstimate.id ? "Duplicating…" : "⎘ Duplicate"}
                        </button>
                      </div>
                    </details>
                  </>
                )}
                <div style={{ marginTop: 12, display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(148,163,184,0.12)", flexWrap: "wrap" }}>
                  <a
                    href={selectedEstimate.publicLink || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={ws.btnSecondary}
                    style={{ flex: "1 1 110px", textAlign: "center", textDecoration: "none", opacity: selectedEstimate.publicLink ? 1 : 0.5, pointerEvents: selectedEstimate.publicLink ? "auto" : "none" }}
                  >
                    Client link
                  </a>
                  <DocumentPdfActions
                    pdfUrl={`/api/estimates/${selectedEstimate.id}/pdf`}
                    printLabel="Print estimate"
                    downloadLabel="Download PDF"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setContractEstimate(selectedEstimate);
                      setContractCategory("Service");
                      setContractOption("");
                      setContractLanguage("en");
                      setContractMessage("");
                    }}
                    className={ws.btnSecondary}
                    style={{ flex: "1 1 110px", textAlign: "center" }}
                  >
                    Generate contract
                  </button>
                </div>

                {contractEstimate?.id === selectedEstimate.id ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      background: "#0b1220",
                      border: "1px solid rgba(96,165,250,0.4)",
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      Contract from estimate {selectedEstimate.estimateNumber || ""}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <label style={{ fontSize: 12, color: "#94a3b8" }}>
                        Category
                        <input
                          type="text"
                          value={contractCategory}
                          onChange={(e) => setContractCategory(e.target.value)}
                          placeholder="Snowplowing, Roofing…"
                          style={{
                            width: "100%",
                            marginTop: 4,
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid rgba(148,163,184,0.3)",
                            background: "#111827",
                            color: "#e2e8f0",
                          }}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: "#94a3b8" }}>
                        Option (optional)
                        <input
                          type="text"
                          value={contractOption}
                          onChange={(e) => setContractOption(e.target.value)}
                          placeholder="e.g. Seasonal contract"
                          style={{
                            width: "100%",
                            marginTop: 4,
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid rgba(148,163,184,0.3)",
                            background: "#111827",
                            color: "#e2e8f0",
                          }}
                        />
                      </label>
                    </div>
                    <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginTop: 8 }}>
                      Language
                      <select
                        value={contractLanguage}
                        onChange={(e) => setContractLanguage(e.target.value)}
                        aria-label="Contract language"
                        style={{
                          width: 140,
                          marginTop: 4,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid rgba(148,163,184,0.3)",
                          background: "#111827",
                          color: "#e2e8f0",
                        }}
                      >
                        <option value="en">English</option>
                        <option value="es">Español</option>
                        <option value="pl">Polski</option>
                      </select>
                    </label>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={generateContract}
                        disabled={contractBusy}
                        className={ws.btnPrimary}
                        style={{ opacity: contractBusy ? 0.7 : 1 }}
                      >
                        {contractBusy ? "Generating…" : "Save contract"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setContractEstimate(null);
                          setContractMessage("");
                          setContractPrintBody("");
                          setContractSavedId("");
                        }}
                        disabled={contractBusy}
                        className={ws.btnSecondary}
                      >
                        Cancel
                      </button>
                      {contractPrintBody ? (
                        <button
                          type="button"
                          className={ws.btnSecondary}
                          onClick={() => {
                            const title = `Contract — ${selectedEstimate.clientName || "Client"}`;
                            openPrintableHtmlDocument({
                              title,
                              bodyHtml: `<h1>${escapeHtml(title)}</h1><pre>${escapeHtml(contractPrintBody)}</pre>`,
                            });
                          }}
                        >
                          Print (browser)
                        </button>
                      ) : null}
                      {contractSavedId ? (
                        <DocumentPdfActions
                          pdfUrl={`/api/contracts/${contractSavedId}/pdf`}
                          printLabel="Print contract"
                          downloadLabel="Download contract PDF"
                        />
                      ) : null}
                    </div>
                    {contractMessage ? (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          color: contractMessage.toLowerCase().includes("unable") ? "#fca5a5" : "#86efac",
                        }}
                      >
                        {contractMessage}
                        {contractSavedId ? (
                          <>
                            {" "}
                            <Link href="/contracts" style={{ color: "#93c5fd", fontWeight: 600 }}>
                              View all contracts
                            </Link>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {contractSavedId &&
                contractEstimate?.id !== selectedEstimate.id ? (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid rgba(148,163,184,0.12)",
                    }}
                  >
                    <div className={est.detailLabel}>Saved contract</div>
                    <DocumentPdfActions
                      pdfUrl={`/api/contracts/${contractSavedId}/pdf`}
                      printLabel="Print contract"
                      downloadLabel="Download contract PDF"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
