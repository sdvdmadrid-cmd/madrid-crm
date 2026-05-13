"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const COPY = {
  en: {
    title: "AI Monitoring",
    subtitle: "Monthly visibility for AI reliability and cost.",
    totalRequests: "Total requests",
    successfulRequests: "Successful",
    failedRequests: "Failed",
    estimatedCostUsd: "Estimated cost (USD)",
    tokenUsage: "Token usage",
    topFeatures: "Most used AI features",
    refresh: "Refresh",
    loading: "Loading AI metrics...",
    errorFallback: "Unable to load AI monitoring metrics.",
    noData: "No AI usage recorded this month yet.",
    monthlyCap: "Monthly cap",
    utilization: "Utilization",
    alerts: {
      normal: "Spend within safe range.",
      warning: "Warning: AI spend reached 70% of monthly cap.",
      critical: "Critical: AI spend reached 85% of monthly cap.",
      capped: "Cap reached: AI spend reached 100% of monthly cap.",
    },
  },
  es: {
    title: "Monitoreo de IA",
    subtitle: "Visibilidad mensual de confiabilidad y costo de IA.",
    totalRequests: "Solicitudes totales",
    successfulRequests: "Exitosas",
    failedRequests: "Fallidas",
    estimatedCostUsd: "Costo estimado (USD)",
    tokenUsage: "Uso de tokens",
    topFeatures: "Funciones de IA mas usadas",
    refresh: "Actualizar",
    loading: "Cargando metricas de IA...",
    errorFallback: "No se pudieron cargar las metricas de monitoreo IA.",
    noData: "Todavia no hay uso de IA registrado este mes.",
    monthlyCap: "Cap mensual",
    utilization: "Uso del cap",
    alerts: {
      normal: "Gasto dentro del rango seguro.",
      warning: "Alerta: el gasto IA llego al 70% del cap mensual.",
      critical: "Critico: el gasto IA llego al 85% del cap mensual.",
      capped: "Cap alcanzado: el gasto IA llego al 100% del cap mensual.",
    },
  },
  pl: {
    title: "Monitoring AI",
    subtitle: "Miesieczny podglad niezawodnosci i kosztu AI.",
    totalRequests: "Laczna liczba zapytan",
    successfulRequests: "Udane",
    failedRequests: "Nieudane",
    estimatedCostUsd: "Szacowany koszt (USD)",
    tokenUsage: "Zuzycie tokenow",
    topFeatures: "Najczesciej uzywane funkcje AI",
    refresh: "Odswiez",
    loading: "Ladowanie metryk AI...",
    errorFallback: "Nie mozna zaladowac metryk monitoringu AI.",
    noData: "Brak zarejestrowanego uzycia AI w tym miesiacu.",
    monthlyCap: "Miesieczny limit",
    utilization: "Wykorzystanie limitu",
    alerts: {
      normal: "Koszt miesci sie w bezpiecznym zakresie.",
      warning: "Ostrzezenie: koszt AI osiagnal 70% limitu miesiecznego.",
      critical: "Krytyczne: koszt AI osiagnal 85% limitu miesiecznego.",
      capped: "Limit osiagniety: koszt AI osiagnal 100% limitu miesiecznego.",
    },
  },
};

const ALERT_STYLES = {
  normal: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  critical: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  capped: "border-rose-600/40 bg-rose-600/15 text-rose-100",
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function AdminAiMonitoringClient() {
  const { i18n } = useTranslation();
  const lang = ["en", "es", "pl"].includes(i18n.language) ? i18n.language : "en";
  const t = COPY[lang];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/admin/ai/monitoring", {
        suppressUnauthorizedEvent: true,
      });
      const payload = await getJsonOrThrow(response, t.errorFallback);
      setMetrics(payload?.data || null);
    } catch (err) {
      setError(err?.message || t.errorFallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const featureRows = useMemo(() => metrics?.topFeatures || [], [metrics]);
  const alertLevel = metrics?.alertLevel || "normal";
  const alertStyle = ALERT_STYLES[alertLevel] || ALERT_STYLES.normal;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t.title}</h2>
          <p className="mt-1 text-sm text-slate-400">{t.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
        >
          {t.refresh}
        </button>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-400">{t.loading}</p> : null}
      {error ? (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!loading && !error && metrics ? (
        <div className={`mt-4 rounded-lg border px-3 py-2 text-sm font-medium ${alertStyle}`}>
          {t.alerts[alertLevel] || t.alerts.normal}
        </div>
      ) : null}

      {!loading && !error && metrics ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-400">{t.totalRequests}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(metrics.totalRequests)}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <p className="text-xs text-emerald-200">{t.successfulRequests}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(metrics.successfulRequests)}</p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
              <p className="text-xs text-rose-200">{t.failedRequests}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(metrics.failedRequests)}</p>
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
              <p className="text-xs text-cyan-200">{t.estimatedCostUsd}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatUsd(metrics.estimatedCostUsd)}</p>
            </div>
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3">
              <p className="text-xs text-indigo-200">{t.monthlyCap}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatUsd(metrics.monthlyCapUsd)}</p>
              <p className="mt-1 text-xs text-indigo-100">{t.utilization}: {metrics.utilizationPercent}%</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,1.1fr]">
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t.tokenUsage}</p>
              <p className="mt-2 text-sm text-slate-300">Prompt: {formatNumber(metrics?.tokenUsage?.prompt)}</p>
              <p className="mt-1 text-sm text-slate-300">Completion: {formatNumber(metrics?.tokenUsage?.completion)}</p>
              <p className="mt-1 text-sm text-slate-200">Total: {formatNumber(metrics?.tokenUsage?.total)}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t.topFeatures}</p>
              <div className="mt-3 space-y-2">
                {featureRows.length === 0 ? (
                  <p className="text-sm text-slate-500">{t.noData}</p>
                ) : (
                  featureRows.map((row) => (
                    <div key={row.feature} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm">
                      <span className="text-slate-200">{row.feature}</span>
                      <span className="text-slate-400">
                        {formatNumber(row.total)} total / {formatNumber(row.failed)} failed
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
