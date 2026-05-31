"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { filterAndRankRecords } from "@/lib/record-search";
import { LEAD_STATUSES } from "@/lib/website-lead-form";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import PlatformZoneBanner from "@/components/workspace/PlatformZoneBanner";
import ws from "@/styles/workspace-dark.module.css";
import li from "./lead-inbox.module.css";

const UI = {
  en: {
    title: "Lead Inbox",
    subtitle: "Website leads and estimate requests in one queue.",
    refresh: "Refresh",
    converting: "Converting…",
    convert: "Convert to Estimate",
    openJobs: "Open Estimates",
    empty: "No leads yet.",
    emptyHint: "New website leads and estimate requests will appear here.",
    sourceLead: "Website lead",
    sourceRequest: "Estimate request",
    status: "Status",
    contact: "Contact",
    details: "Details",
    success: "Converted to estimate successfully.",
    failed: "Conversion failed.",
    suggestReply: "Suggest reply",
    suggestingReply: "Drafting…",
    replySuggestion: "Suggested reply",
    replyFailed: "Unable to generate reply suggestion.",
    total: (n) => `${n} lead${n === 1 ? "" : "s"}`,
    search: "Search leads",
    filterStatus: "Filter by status",
    filterSource: "Filter by source",
    allStatuses: "All statuses",
    markContacted: "Mark contacted",
    markCompleted: "Mark completed",
    updating: "Updating…",
    budget: "Budget",
    timeline: "Timeline",
    service: "Service",
    photo: "Project photo",
    statusUpdated: "Lead status updated.",
    statusFailed: "Could not update status.",
    filterEmpty: "No leads match your search or filters.",
    sourceAll: "All sources",
    sourceWebsite: "Website leads",
    sourceRequest: "Estimate requests",
    summaryNew: (n) => `${n} new`,
    summaryContacted: (n) => `${n} contacted`,
    openEstimate: "Open new estimate",
    copyReply: "Copy reply",
    copied: "Copied",
    showMore: "Show full message",
    showLess: "Show less",
    call: "Call",
    emailAction: "Email",
  },
  es: {
    title: "Bandeja de Leads",
    subtitle: "Leads web y solicitudes de estimado en una sola cola.",
    refresh: "Actualizar",
    converting: "Convirtiendo…",
    convert: "Convertir a estimado",
    openJobs: "Abrir Estimados",
    empty: "Aún no hay leads.",
    emptyHint: "Los nuevos leads y solicitudes de estimado aparecerán aquí.",
    sourceLead: "Lead del sitio web",
    sourceRequest: "Solicitud de estimado",
    status: "Estado",
    contact: "Contacto",
    details: "Detalles",
    success: "Convertido a estimado correctamente.",
    failed: "La conversión falló.",
    suggestReply: "Sugerir respuesta",
    suggestingReply: "Redactando…",
    replySuggestion: "Respuesta sugerida",
    replyFailed: "No se pudo generar la respuesta sugerida.",
    total: (n) => `${n} lead${n === 1 ? "" : "s"}`,
    search: "Search leads",
    filterStatus: "Filter by status",
    filterSource: "Filter by source",
    allStatuses: "All statuses",
    markContacted: "Mark contacted",
    markCompleted: "Mark completed",
    updating: "Updating…",
    budget: "Budget",
    timeline: "Timeline",
    service: "Service",
    photo: "Project photo",
    statusUpdated: "Estado del lead actualizado.",
    statusFailed: "No se pudo actualizar el estado.",
    filterEmpty: "Ningún lead coincide con la búsqueda o filtros.",
    sourceAll: "Todas las fuentes",
    sourceWebsite: "Leads del sitio",
    sourceRequest: "Solicitudes de estimado",
    summaryNew: (n) => `${n} nuevos`,
    summaryContacted: (n) => `${n} contactados`,
    openEstimate: "Abrir estimado nuevo",
    copyReply: "Copiar respuesta",
    copied: "Copiado",
    showMore: "Ver mensaje completo",
    showLess: "Ver menos",
    call: "Llamar",
    emailAction: "Correo",
  },
  pl: {
    title: "Skrzynka Leadów",
    subtitle: "Leady ze strony i prośby o wycenę w jednej kolejce.",
    refresh: "Odśwież",
    converting: "Konwersja…",
    convert: "Konwertuj do wyceny",
    openJobs: "Otwórz wyceny",
    empty: "Brak leadów.",
    emptyHint: "Nowe leady i prośby o wycenę pojawią się tutaj.",
    sourceLead: "Lead ze strony",
    sourceRequest: "Prośba o wycenę",
    status: "Status",
    contact: "Kontakt",
    details: "Szczegóły",
    success: "Pomyślnie przekonwertowano do wyceny.",
    failed: "Konwersja nieudana.",
    suggestReply: "Zaproponuj odpowiedz",
    suggestingReply: "Tworzenie…",
    replySuggestion: "Sugerowana odpowiedz",
    replyFailed: "Nie udalo sie wygenerowac odpowiedzi.",
    total: (n) => `${n} lead${n === 1 ? "" : "ów"}`,
    search: "Szukaj leadów",
    filterStatus: "Filtruj według statusu",
    filterSource: "Filtruj według źródła",
    allStatuses: "Wszystkie statusy",
    markContacted: "Oznacz jako skontaktowany",
    markCompleted: "Oznacz jako zakończony",
    updating: "Aktualizacja…",
    budget: "Budżet",
    timeline: "Termin",
    service: "Usługa",
    photo: "Zdjęcie projektu",
    statusUpdated: "Status leada zaktualizowany.",
    statusFailed: "Nie udało się zaktualizować statusu.",
    filterEmpty: "Brak leadów pasujących do wyszukiwania lub filtrów.",
    sourceAll: "Wszystkie źródła",
    sourceWebsite: "Leady ze strony",
    sourceRequest: "Prośby o wycenę",
    summaryNew: (n) => `${n} nowych`,
    summaryContacted: (n) => `${n} skontaktowanych`,
    openEstimate: "Otwórz nową wycenę",
    copyReply: "Kopiuj odpowiedź",
    copied: "Skopiowano",
    showMore: "Pokaż całą wiadomość",
    showLess: "Zwiń",
    call: "Zadzwoń",
    emailAction: "E-mail",
  },
};

const FILTER_STATUSES = LEAD_STATUSES.filter((s) => s !== "converted");

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClass(status) {
  const s = String(status || "new").toLowerCase();
  if (s === "pending") return li.badgeStatusPending;
  if (s === "reviewed") return li.badgeStatusReviewed;
  return li.badgeStatus;
}

function LeadCard({
  item,
  t,
  isConverting,
  isUpdatingStatus,
  onConvert,
  onSuggestReply,
  onStatusChange,
  suggestingReply,
  replyDraft,
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const sourceName = item.source === "website_lead" ? t.sourceLead : t.sourceRequest;
  const sourceClass =
    item.source === "estimate_request" ? li.badgeSourceRequest : li.badgeSource;
  const description = String(item.description || "").trim();
  const longDescription = description.length > 220;

  const copyReply = async () => {
    if (!replyDraft || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(replyDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <article className={li.card} data-testid="lead-card">
      <div className={li.cardHead}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className={li.cardTitle}>{item.name || "Unnamed"}</h2>
          <p className={li.cardDate}>{formatDate(item.createdAt)}</p>
        </div>
        <div className={li.badges}>
          <span className={`${li.badgeSource} ${sourceClass}`}>{sourceName}</span>
          <span className={`${li.badgeStatus} ${statusBadgeClass(item.status)}`}>
            <span className={li.badgeDot} />
            {item.status || "new"}
          </span>
        </div>
      </div>

      {item.phone || item.email ? (
        <div className={li.quickActions}>
          {item.phone ? (
            <a className={li.quickActionBtn} href={`tel:${item.phone}`}>
              {t.call}
            </a>
          ) : null}
          {item.email ? (
            <a className={li.quickActionBtn} href={`mailto:${item.email}`}>
              {t.emailAction}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className={li.divider} />

      <div className={li.cardBody}>
        <div>
          <p className={li.sectionLabel}>{t.contact}</p>
          {item.email ? (
            <p className={li.contactLine}>
              <a href={`mailto:${item.email}`}>{item.email}</a>
            </p>
          ) : null}
          {item.phone ? (
            <p className={li.contactLine}>
              <a href={`tel:${item.phone}`}>{item.phone}</a>
            </p>
          ) : null}
          {item.address ? <p className={li.contactLine}>{item.address}</p> : null}
          {!item.email && !item.phone && !item.address ? (
            <p className={li.contactLine}>—</p>
          ) : null}
        </div>
        <div>
          <p className={li.sectionLabel}>{t.details}</p>
          {item.serviceNeeded ? (
            <p className={li.contactLine}>
              <strong>{t.service}:</strong> {item.serviceNeeded}
            </p>
          ) : null}
          {item.budgetRange ? (
            <p className={li.contactLine}>
              <strong>{t.budget}:</strong> {item.budgetRange}
            </p>
          ) : null}
          {item.timeline ? (
            <p className={li.contactLine}>
              <strong>{t.timeline}:</strong> {item.timeline}
            </p>
          ) : null}
          <p
            className={`${li.details} ${expanded ? li.detailsExpanded : ""}`}
          >
            {description || "—"}
          </p>
          {longDescription ? (
            <button
              type="button"
              className={li.expandBtn}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? t.showLess : t.showMore}
            </button>
          ) : null}
          {item.photoUrl ? (
            <div style={{ marginTop: 12 }}>
              <p className={li.sectionLabel}>{t.photo}</p>
              <a href={item.photoUrl} target="_blank" rel="noreferrer">
                <img
                  src={item.photoUrl}
                  alt=""
                  className={li.leadPhoto}
                />
              </a>
            </div>
          ) : null}
        </div>
      </div>

      {item.source === "website_lead" ? (
        <div className={li.statusRow}>
          <label className={li.sectionLabel} htmlFor={`status-${item.id}`}>
            {t.status}
          </label>
          <select
            id={`status-${item.id}`}
            className={li.statusSelect}
            value={item.status || "new"}
            disabled={isUpdatingStatus}
            onChange={(e) => onStatusChange(item, e.target.value)}
          >
            {FILTER_STATUSES.filter((s) => s !== "archived").map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className={li.cardFooter}>
        <button
          type="button"
          className={li.btnAi}
          onClick={() => onSuggestReply(item)}
          disabled={suggestingReply}
        >
          {suggestingReply ? t.suggestingReply : t.suggestReply}
        </button>
        <button
          type="button"
          className={li.btnConvert}
          onClick={() => onConvert(item)}
          disabled={isConverting}
        >
          {isConverting ? t.converting : t.convert}
        </button>
      </div>

      {replyDraft ? (
        <div className={li.replyBox}>
          <div className={li.replyHead}>
            <p className={li.replyLabel}>{t.replySuggestion}</p>
            <button type="button" className={li.copyReplyBtn} onClick={copyReply}>
              {copied ? t.copied : t.copyReply}
            </button>
          </div>
          <textarea className={li.replyText} value={replyDraft} readOnly />
        </div>
      ) : null}
    </article>
  );
}

export default function LeadInboxPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [convertingId, setConvertingId] = useState("");
  const [replyLoadingId, setReplyLoadingId] = useState("");
  const [replyById, setReplyById] = useState({});
  const [statusUpdatingId, setStatusUpdatingId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const lang =
    typeof window !== "undefined"
      ? window.localStorage.getItem("ui_language") || "en"
      : "en";
  const t = UI[lang] || UI.en;

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await apiFetch("/api/lead-inbox", {
        suppressUnauthorizedEvent: true,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.status === 401) {
        throw new Error("Session expired. Please sign in again.");
      }
      const json = await getJsonOrThrow(res, "Load failed");
      setItems(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(
        err?.name === "AbortError"
          ? "Request timed out. Please click Refresh."
          : err.message || "Load failed",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const activeItems = useMemo(
    () => items.filter((item) => String(item.status || "").toLowerCase() !== "converted"),
    [items],
  );

  const statusSummary = useMemo(() => {
    const counts = { new: 0, contacted: 0 };
    for (const item of activeItems) {
      const status = String(item.status || "new").toLowerCase();
      if (status === "new") counts.new += 1;
      if (status === "contacted") counts.contacted += 1;
    }
    return counts;
  }, [activeItems]);

  const filteredItems = useMemo(() => {
    let list = activeItems;
    if (sourceFilter) {
      list = list.filter((item) => item.source === sourceFilter);
    }
    if (statusFilter && String(statusFilter).toLowerCase()) {
      list = list.filter(
        (item) =>
          String(item.status || "").toLowerCase() === statusFilter.toLowerCase(),
      );
    }
    if (search.trim()) {
      list = filterAndRankRecords(list, search, (item) => [
        item.name,
        item.email,
        item.phone,
        item.address,
        item.description,
        item.serviceNeeded,
      ]);
    }
    return list;
  }, [activeItems, search, sourceFilter, statusFilter]);

  const updateLeadStatus = async (item, status) => {
    if (item.source !== "website_lead") return;
    setStatusUpdatingId(item.id);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/lead-inbox/leads/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await getJsonOrThrow(res, t.statusFailed);
      setNotice(t.statusUpdated);
      await fetchInbox();
    } catch (err) {
      setError(err.message || t.statusFailed);
    } finally {
      setStatusUpdatingId("");
    }
  };

  const convertToJob = async (item) => {
    setConvertingId(item.id);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/lead-inbox/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: item.source,
          leadId: item.source === "website_lead" ? item.id : "",
          requestId: item.source === "estimate_request" ? item.id : "",
          target: "estimate",
        }),
      });
      const payload = await getJsonOrThrow(res, t.failed);
      const estimateId = payload?.data?.estimateId;
      setNotice(
        estimateId
          ? `${t.success} ${t.openEstimate}.`
          : t.success,
      );
      await fetchInbox();
      if (estimateId) {
        router.push(`/estimates/new?edit=${estimateId}`);
      }
    } catch (err) {
      setError(err.message || t.failed);
    } finally {
      setConvertingId("");
    }
  };

  const suggestReply = async (item) => {
    setReplyLoadingId(item.id);
    setError("");
    try {
      const res = await apiFetch("/api/ai/client-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientMessage: item.description || `Lead from ${item.name || "client"}`,
          context: `Name: ${item.name || ""}; Email: ${item.email || ""}; Phone: ${item.phone || ""}; Source: ${item.source || "website_lead"}`,
          tone: "professional",
        }),
      });
      const payload = await getJsonOrThrow(res, t.replyFailed);
      const nextReply = String(payload?.data?.reply || "").trim();
      if (nextReply) {
        setReplyById((current) => ({ ...current, [item.id]: nextReply }));
      }
    } catch (err) {
      setError(err.message || t.replyFailed);
    } finally {
      setReplyLoadingId("");
    }
  };

  const headerActions = (
    <>
      {!loading && activeItems.length > 0 ? (
        <span className={li.countPill}>{t.total(activeItems.length)}</span>
      ) : null}
      <button type="button" onClick={fetchInbox} disabled={loading} className={ws.btnSecondary}>
        {t.refresh}
      </button>
      <button type="button" onClick={() => router.push("/estimates")} className={ws.btnPrimary}>
        {t.openJobs}
      </button>
    </>
  );

  return (
    <PremiumPageShell title={t.title} subtitle={t.subtitle} actions={headerActions}>
      <PlatformZoneBanner zone="private" />
      {notice ? <div className={ws.noticeSuccess}>{notice}</div> : null}
      {error ? <div className={ws.noticeErrorBlock}>{error}</div> : null}

      {loading ? (
        <div className={li.grid}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${li.skeleton} fb-shimmer`} />
          ))}
        </div>
      ) : null}

      {!loading && activeItems.length === 0 ? (
        <div className="fb-empty" style={{ marginTop: 24 }}>
          <p className="fb-empty-title">{t.empty}</p>
          <p className="fb-empty-desc">{t.emptyHint}</p>
        </div>
      ) : null}

      {!loading ? (
        <>
          {activeItems.length > 0 ? (
            <div className={li.summaryBar}>
              <span className={li.summaryChip}>{t.summaryNew(statusSummary.new)}</span>
              <span className={li.summaryChip}>
                {t.summaryContacted(statusSummary.contacted)}
              </span>
            </div>
          ) : null}
          <div className={li.toolbar}>
            <input
              type="search"
              className={li.searchInput}
              placeholder={t.search}
              aria-label={t.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={li.statusSelect}
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label={t.filterSource}
            >
              <option value="">{t.sourceAll}</option>
              <option value="website_lead">{t.sourceWebsite}</option>
              <option value="estimate_request">{t.sourceRequest}</option>
            </select>
            <select
              className={li.statusSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t.filterStatus}
            >
              <option value="">{t.allStatuses}</option>
              {FILTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          {activeItems.length > 0 && filteredItems.length === 0 ? (
            <p className={li.filterEmpty}>{t.filterEmpty}</p>
          ) : null}
          <div className={li.grid}>
            {filteredItems.map((item) => (
              <LeadCard
                key={`${item.source}-${item.id}`}
                item={item}
                t={t}
                isConverting={convertingId === item.id}
                isUpdatingStatus={statusUpdatingId === item.id}
                onConvert={convertToJob}
                onSuggestReply={suggestReply}
                onStatusChange={updateLeadStatus}
                suggestingReply={replyLoadingId === item.id}
                replyDraft={replyById[item.id] || ""}
              />
            ))}
          </div>
        </>
      ) : null}
    </PremiumPageShell>
  );
}
