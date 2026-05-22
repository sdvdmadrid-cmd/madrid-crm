"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
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
  },
};

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
  onConvert,
  onSuggestReply,
  suggestingReply,
  replyDraft,
}) {
  const sourceName = item.source === "website_lead" ? t.sourceLead : t.sourceRequest;
  const sourceClass =
    item.source === "estimate_request" ? li.badgeSourceRequest : li.badgeSource;

  return (
    <article className={li.card}>
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
          <p className={li.details}>{item.description || "—"}</p>
        </div>
      </div>

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
          <p className={li.replyLabel}>{t.replySuggestion}</p>
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
      await getJsonOrThrow(res, t.failed);
      setNotice(t.success);
      await fetchInbox();
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

      {!loading && activeItems.length > 0 ? (
        <div className={li.grid}>
          {activeItems.map((item) => (
            <LeadCard
              key={`${item.source}-${item.id}`}
              item={item}
              t={t}
              isConverting={convertingId === item.id}
              onConvert={convertToJob}
              onSuggestReply={suggestReply}
              suggestingReply={replyLoadingId === item.id}
              replyDraft={replyById[item.id] || ""}
            />
          ))}
        </div>
      ) : null}
    </PremiumPageShell>
  );
}
