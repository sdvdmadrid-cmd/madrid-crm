"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

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
    total: (n) => `${n} lead${n === 1 ? "" : "ów"}`,
  },
};

const SOURCE_COLORS = {
  website_lead:    { bg: "bg-violet-50",  text: "text-violet-700",  ring: "ring-violet-200" },
  estimate_request: { bg: "bg-sky-50",    text: "text-sky-700",     ring: "ring-sky-200"    },
};

const STATUS_COLORS = {
  new:      { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  pending:  { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500"   },
  reviewed: { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500"    },
  default:  { bg: "bg-gray-100",   text: "text-gray-600",    dot: "bg-gray-400"    },
};

function statusColors(status) {
  return STATUS_COLORS[String(status || "").toLowerCase()] ?? STATUS_COLORS.default;
}

function sourceColors(source) {
  return SOURCE_COLORS[source] ?? SOURCE_COLORS.website_lead;
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function LeadCard({ item, t, isConverting, onConvert }) {
  const sc = sourceColors(item.source);
  const st = statusColors(item.status);
  const sourceName = item.source === "website_lead" ? t.sourceLead : t.sourceRequest;

  return (
    <article className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden">
      {/* Card top bar */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-gray-900 leading-snug truncate">
            {item.name || "Unnamed"}
          </h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{formatDate(item.createdAt)}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Source badge */}
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full ring-1 ${sc.bg} ${sc.text} ${sc.ring}`}>
            {sourceName}
          </span>
          {/* Status badge */}
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {item.status || "new"}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 mx-5" />

      {/* Contact + Details */}
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">{t.contact}</p>
          <div className="space-y-1">
            {item.email && (
              <a href={`mailto:${item.email}`} className="flex items-center gap-1.5 text-[13px] text-blue-600 hover:underline truncate">
                <span className="text-gray-400 text-[11px]">✉</span>{item.email}
              </a>
            )}
            {item.phone && (
              <a href={`tel:${item.phone}`} className="flex items-center gap-1.5 text-[13px] text-gray-700 hover:text-gray-900 truncate">
                <span className="text-gray-400 text-[11px]">📞</span>{item.phone}
              </a>
            )}
            {item.address && (
              <p className="flex items-start gap-1.5 text-[13px] text-gray-600">
                <span className="text-gray-400 text-[11px] mt-0.5">📍</span>
                <span className="break-words">{item.address}</span>
              </p>
            )}
            {!item.email && !item.phone && !item.address && (
              <p className="text-[13px] text-gray-400">—</p>
            )}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">{t.details}</p>
          <p className="text-[13px] text-gray-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">
            {item.description || "—"}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-5 pt-2 flex justify-end">
        <button
          onClick={() => onConvert(item)}
          disabled={isConverting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {isConverting ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {t.converting}
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t.convert}
            </>
          )}
        </button>
      </div>
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
      if (err?.name === "AbortError") {
        setError("Request timed out. Please click Refresh.");
      } else {
        setError(err.message || "Load failed");
      }
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
      const payload = {
        source: item.source,
        leadId: item.source === "website_lead" ? item.id : "",
        requestId: item.source === "estimate_request" ? item.id : "",
        target: "estimate",
      };

      const res = await apiFetch("/api/lead-inbox/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 sm:px-8 lg:px-10 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{t.title}</h1>
            <p className="mt-1 text-sm text-gray-500">{t.subtitle}</p>
          </div>

          <div className="flex items-center gap-2.5">
            {!loading && activeItems.length > 0 && (
              <span className="text-sm font-medium text-gray-500 mr-1">
                {t.total(activeItems.length)}
              </span>
            )}
            <button
              onClick={fetchInbox}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
            >
              <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.635 19A9 9 0 104.582 9H4" />
              </svg>
              {t.refresh}
            </button>
            <button
              onClick={() => router.push("/estimates")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 active:scale-95 transition-all shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
              </svg>
              {t.openJobs}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 sm:px-8 lg:px-10 py-8">
        {/* Toast notices */}
        {notice && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium px-4 py-3 rounded-xl shadow-sm">
            <svg className="h-4 w-4 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 text-sm font-medium px-4 py-3 rounded-xl shadow-sm">
            <svg className="h-4 w-4 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L2 18a1 1 0 00.86 1.5h18.28A1 1 0 0022 18L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 h-60 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && activeItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
              <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700">{t.empty}</p>
            <p className="mt-1 text-sm text-gray-400 max-w-xs">{t.emptyHint}</p>
          </div>
        )}

        {/* Cards grid */}
        {!loading && activeItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {activeItems.map((item) => (
              <LeadCard
                key={`${item.source}-${item.id}`}
                item={item}
                t={t}
                isConverting={convertingId === item.id}
                onConvert={convertToJob}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
