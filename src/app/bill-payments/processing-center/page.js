"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-auth";

const DEFAULT_FILTERS = {
  from: "",
  to: "",
  interval: "weekly",
  deduplicated: true,
  includeConnectedAccounts: true,
  paymentMethodType: "card",
  brand: "all",
  country: "all",
  interactionType: "all",
  status: "all",
  provider: "all",
};

function formatCurrency(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "USD").toUpperCase(),
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function toIsoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildDefaultDateRange() {
  const now = new Date();
  const to = toIsoDate(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 84);
  return { from: toIsoDate(from), to };
}

function toSearchParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    params.set(key, String(value));
  });
  return params.toString();
}

function parseFiltersFromSearch(searchParams) {
  const base = {
    ...DEFAULT_FILTERS,
    ...buildDefaultDateRange(),
  };

  const parseToken = (value, fallback) => {
    const raw = String(value || "").trim().toLowerCase();
    return raw || fallback;
  };

  return {
    from: String(searchParams.get("from") || base.from),
    to: String(searchParams.get("to") || base.to),
    interval: parseToken(searchParams.get("interval"), base.interval),
    deduplicated: String(searchParams.get("deduplicated") || "true") !== "false",
    includeConnectedAccounts:
      String(searchParams.get("includeConnectedAccounts") || "true") !== "false",
    paymentMethodType: parseToken(searchParams.get("paymentMethodType"), base.paymentMethodType),
    brand: parseToken(searchParams.get("brand"), base.brand),
    country: parseToken(searchParams.get("country"), base.country),
    interactionType: parseToken(searchParams.get("interactionType"), base.interactionType),
    status: parseToken(searchParams.get("status"), base.status),
    provider: parseToken(searchParams.get("provider"), base.provider),
  };
}

function prettyDelta(value, mode = "number") {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  if (mode === "money") return `${sign}${formatCurrency(numeric)}`;
  if (mode === "percent") return `${sign}${numeric.toFixed(2)}%`;
  return `${sign}${numeric.toFixed(2)}`;
}

function useDebounced(value, delayMs = 220) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function MetricCard({ title, value, subtitle, delta, active, onClick }) {
  const deltaPositive = Number(delta || 0) >= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        borderRadius: 18,
        border: active ? "1.5px solid #0ea5e9" : "1px solid rgba(15,23,42,0.10)",
        background: active
          ? "linear-gradient(145deg, rgba(14,165,233,0.10), rgba(255,255,255,0.95))"
          : "rgba(255,255,255,0.94)",
        padding: "16px 16px 14px",
        cursor: "pointer",
        boxShadow: active ? "0 16px 30px rgba(14,165,233,0.14)" : "0 8px 18px rgba(15,23,42,0.07)",
      }}
    >
      <div style={{ color: "#475569", fontSize: 13, fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 6, color: "#0f172a", fontSize: 34, fontWeight: 800, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>{subtitle}</div>
      {typeof delta === "number" && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            fontWeight: 800,
            color: deltaPositive ? "#047857" : "#b91c1c",
          }}
        >
          {deltaPositive ? "▲" : "▼"} {prettyDelta(delta, "percent")} vs previous period
        </div>
      )}
    </button>
  );
}

export default function BillPaymentsProcessingCenterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsedFilters = useMemo(
    () => parseFiltersFromSearch(searchParams),
    [searchParams],
  );

  const [filters, setFilters] = useState(parsedFilters);
  const [activeMetric, setActiveMetric] = useState("acceptedVolume");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quickFilterPanel, setQuickFilterPanel] = useState("");
  const [payload, setPayload] = useState({
    summary: null,
    buckets: [],
    quickFilters: {
      cardTypes: [],
      brands: [],
      countries: [],
      interactionTypes: [],
      providers: [],
    },
    previousSummary: null,
    delta: null,
    providers: [],
    recentTransactions: [],
  });

  const debouncedFilters = useDebounced(filters, 180);

  useEffect(() => {
    setFilters(parsedFilters);
  }, [parsedFilters]);

  const fetchAnalytics = useMemo(
    () => async (currentFilters) => {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch(
          `/api/bill-payments/analytics?${toSearchParams(currentFilters)}`,
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.success) {
          throw new Error(json?.error || "Unable to load processing analytics");
        }
        setPayload(json.data || {});
      } catch (err) {
        setError(err.message || "Unable to load processing analytics");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const nextQuery = toSearchParams(debouncedFilters);
    if (nextQuery !== searchParams.toString()) {
      router.replace(`${pathname}?${nextQuery}`, { scroll: false });
    }
  }, [debouncedFilters, pathname, router, searchParams]);

  useEffect(() => {
    fetchAnalytics(debouncedFilters);
  }, [debouncedFilters, fetchAnalytics]);

  const summary = payload.summary || {
    totalVolume: 0,
    acceptedVolume: 0,
    totalPayments: 0,
    acceptedPayments: 0,
    failedPayments: 0,
    totalFees: 0,
    successRate: 0,
  };

  const previousSummary = payload.previousSummary || {
    acceptedVolume: 0,
    acceptedPayments: 0,
    failedPayments: 0,
    successRate: 0,
    totalFees: 0,
  };

  const delta = payload.delta || {};

  const maxBucketValue = useMemo(() => {
    const values = (payload.buckets || []).map((bucket) => {
      if (activeMetric === "successRate") {
        const attempts = Number(bucket.totalPayments || 0);
        if (attempts <= 0) return 0;
        return (Number(bucket.acceptedPayments || 0) / attempts) * 100;
      }
      if (activeMetric === "acceptedPayments") {
        return Number(bucket.acceptedPayments || 0);
      }
      if (activeMetric === "successRate") {
        const attempts = Number(bucket.acceptedPayments || 0) + Number(bucket.failedPayments || 0);
        return attempts > 0
          ? (Number(bucket.acceptedPayments || 0) / attempts) * 100
          : 0;
      }
      return Number(bucket.acceptedVolume || 0);
    });
    return Math.max(1, ...values);
  }, [payload.buckets, activeMetric]);

  const chartBars = (payload.buckets || []).map((bucket) => {
    let acceptedValue = Number(bucket.acceptedVolume || 0);
    let failedValue = Number(bucket.failedVolume || 0);
    if (activeMetric === "acceptedPayments") {
      acceptedValue = Number(bucket.acceptedPayments || 0);
      failedValue = Number(bucket.failedPayments || 0);
    } else if (activeMetric === "successRate") {
      const attempts = Number(bucket.acceptedPayments || 0) + Number(bucket.failedPayments || 0);
      acceptedValue = attempts > 0 ? (Number(bucket.acceptedPayments || 0) / attempts) * 100 : 0;
      failedValue = attempts > 0 ? (Number(bucket.failedPayments || 0) / attempts) * 100 : 0;
    }

    return {
      key: bucket.key,
      acceptedValue,
      failedValue,
      acceptedHeightPct: Math.max(4, (acceptedValue / maxBucketValue) * 100),
      failedHeightPct: Math.max(4, (failedValue / maxBucketValue) * 100),
    };
  });

  const topProviders = payload.providers || [];

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "22px",
        background:
          "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.18), transparent 34%), radial-gradient(circle at 100% 100%, rgba(249,115,22,0.16), transparent 38%), #eef2ff",
        fontFamily: "'Space Grotesk', 'Sora', 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1340, margin: "0 auto", display: "grid", gap: 18 }}>
        <section
          style={{
            borderRadius: 28,
            padding: "22px",
            color: "#f8fafc",
            background:
              "linear-gradient(120deg, rgba(2,6,23,0.97), rgba(15,23,42,0.96) 58%, rgba(2,132,199,0.84))",
            boxShadow: "0 34px 74px rgba(15,23,42,0.36)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#67e8f9", fontWeight: 700 }}>
                Credit Card Processing Center
              </p>
              <h1 style={{ margin: "8px 0 0", fontSize: "clamp(1.8rem,3vw,2.8rem)", lineHeight: 1.02 }}>
                Control your bill payment rail like an ops command desk.
              </h1>
              <p style={{ margin: "10px 0 0", color: "rgba(226,232,240,0.88)", maxWidth: 760 }}>
                Filter by method, brand, country, and interaction type. Track accepted volume, conversion, and failures in one place.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "start", flexWrap: "wrap" }}>
              <Link
                href="/bill-payments"
                style={{
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  color: "#e2e8f0",
                  textDecoration: "none",
                  padding: "10px 14px",
                  fontWeight: 700,
                  border: "1px solid rgba(148,163,184,0.35)",
                }}
              >
                Back to Bills
              </Link>
              <button
                type="button"
                onClick={() => fetchAnalytics(filters)}
                style={{
                  borderRadius: 999,
                  border: 0,
                  background: "linear-gradient(135deg,#06b6d4,#0ea5e9)",
                  color: "#fff",
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Refresh data
              </button>
              <a
                href="/api/bill-payments/export"
                style={{
                  borderRadius: 999,
                  background: "rgba(14,165,233,0.14)",
                  color: "#7dd3fc",
                  textDecoration: "none",
                  padding: "10px 14px",
                  fontWeight: 700,
                  border: "1px solid rgba(14,165,233,0.42)",
                }}
              >
                Export CSV
              </a>
            </div>
          </div>
          <div style={{ marginTop: 10, color: "rgba(226,232,240,0.82)", fontSize: 13 }}>
            Compared to previous period: {filters.from} to {filters.to}
          </div>
        </section>

        <section
          style={{
            borderRadius: 22,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.95)",
            padding: "16px",
            boxShadow: "0 16px 34px rgba(15,23,42,0.08)",
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
              style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px" }}
            />
            <input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
              style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px" }}
            />
            <select
              value={filters.interval}
              onChange={(event) => setFilters((current) => ({ ...current, interval: event.target.value }))}
              style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select
              value={filters.deduplicated ? "deduplicated" : "all"}
              onChange={(event) =>
                setFilters((current) => ({ ...current, deduplicated: event.target.value === "deduplicated" }))
              }
              style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
            >
              <option value="deduplicated">Deduplicated</option>
              <option value="all">All attempts</option>
            </select>
            <select
              value={activeMetric}
              onChange={(event) => setActiveMetric(event.target.value)}
              style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
            >
              <option value="acceptedVolume">Accepted volume</option>
              <option value="acceptedPayments">Accepted payments</option>
              <option value="successRate">Payment success rate</option>
            </select>
            <button
              type="button"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  includeConnectedAccounts: !current.includeConnectedAccounts,
                }))
              }
              style={{
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.16)",
                padding: "10px 12px",
                background: filters.includeConnectedAccounts ? "#0f172a" : "#fff",
                color: filters.includeConnectedAccounts ? "#fff" : "#0f172a",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {filters.includeConnectedAccounts ? "Including connected accounts" : "Exclude connected accounts"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ color: "#334155", fontWeight: 600 }}>Select payment method</label>
            <select
              value={filters.paymentMethodType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, paymentMethodType: event.target.value }))
              }
              style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
            >
              <option value="all">All</option>
              {(payload.quickFilters?.cardTypes || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            {[
              { key: "cardType", label: "Card type" },
              { key: "country", label: "Card country" },
              { key: "brand", label: "Card brand" },
              { key: "interactionType", label: "Interaction type" },
              { key: "more", label: "More filters" },
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setQuickFilterPanel((current) => (current === chip.key ? "" : chip.key))}
                style={{
                  borderRadius: 999,
                  border: "1px dashed rgba(15,23,42,0.26)",
                  background: quickFilterPanel === chip.key ? "rgba(14,165,233,0.10)" : "#fff",
                  padding: "9px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + {chip.label}
              </button>
            ))}
          </div>

          {quickFilterPanel === "brand" && (
            <div>
              <select
                value={filters.brand}
                onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))}
                style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
              >
                <option value="all">All brands</option>
                {(payload.quickFilters?.brands || []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          )}

          {quickFilterPanel === "country" && (
            <div>
              <select
                value={filters.country}
                onChange={(event) => setFilters((current) => ({ ...current, country: event.target.value }))}
                style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
              >
                <option value="all">All countries</option>
                {(payload.quickFilters?.countries || []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          )}

          {quickFilterPanel === "interactionType" && (
            <div>
              <select
                value={filters.interactionType}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, interactionType: event.target.value }))
                }
                style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
              >
                <option value="all">All interactions</option>
                {(payload.quickFilters?.interactionTypes || []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          )}

          {quickFilterPanel === "cardType" && (
            <div>
              <select
                value={filters.paymentMethodType}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, paymentMethodType: event.target.value }))
                }
                style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
              >
                <option value="all">All card types</option>
                {(payload.quickFilters?.cardTypes || []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          )}

          {quickFilterPanel === "more" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
              >
                <option value="all">Status: All</option>
                <option value="paid">Paid</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
                <option value="scheduled">Scheduled</option>
              </select>
              <select
                value={filters.provider}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, provider: event.target.value }))
                }
                style={{ borderRadius: 12, border: "1px solid rgba(15,23,42,0.16)", padding: "10px 12px", background: "#fff" }}
              >
                <option value="all">Provider: All</option>
                {(payload.quickFilters?.providers || []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        {error ? (
          <div style={{ borderRadius: 14, border: "1px solid #fecaca", background: "#fff1f2", padding: "12px 14px", color: "#b91c1c", fontWeight: 700 }}>
            {error}
          </div>
        ) : null}

        {notice ? (
          <div style={{ borderRadius: 14, border: "1px solid #99f6e4", background: "#ecfeff", padding: "12px 14px", color: "#0f766e", fontWeight: 700 }}>
            {notice}
          </div>
        ) : null}

        <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <MetricCard
            title="Accepted volume"
            value={formatCurrency(summary.acceptedVolume || 0)}
            subtitle={`${formatCompactNumber(summary.acceptedPayments || 0)} successful payments`}
            delta={Number(delta?.acceptedVolume?.percentage || 0)}
            active={activeMetric === "acceptedVolume"}
            onClick={() => setActiveMetric("acceptedVolume")}
          />
          <MetricCard
            title="Accepted payments"
            value={formatCompactNumber(summary.acceptedPayments || 0)}
            subtitle={`Out of ${formatCompactNumber(summary.totalPayments || 0)} total attempts`}
            delta={Number(delta?.acceptedPayments?.percentage || 0)}
            active={activeMetric === "acceptedPayments"}
            onClick={() => setActiveMetric("acceptedPayments")}
          />
          <MetricCard
            title="Payment success rate"
            value={formatPercent(summary.successRate || 0)}
            subtitle={`${formatCompactNumber(summary.failedPayments || 0)} failed attempts`}
            delta={Number(delta?.successRate?.absolute || 0)}
            active={activeMetric === "successRate"}
            onClick={() => setActiveMetric("successRate")}
          />
          <MetricCard
            title="Total fees"
            value={formatCurrency(summary.totalFees || 0)}
            subtitle={`Previous: ${formatCurrency(previousSummary.totalFees || 0)}`}
            delta={Number(delta?.totalFees?.percentage || 0)}
            active={false}
            onClick={() => setNotice("Total fees card is informational.")}
          />
        </section>

        <section
          style={{
            borderRadius: 22,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.96)",
            padding: "16px",
            boxShadow: "0 16px 34px rgba(15,23,42,0.08)",
          }}
        >
          <h2 style={{ margin: 0, color: "#0f172a" }}>Trend</h2>
          <p style={{ margin: "6px 0 14px", color: "#64748b" }}>
            {activeMetric === "acceptedVolume"
              ? "Accepted volume"
              : activeMetric === "acceptedPayments"
                ? "Accepted payments"
                : "Payment success rate"}
            {loading ? " (loading...)" : ""}
          </p>
          <div style={{ height: 230, display: "flex", gap: 8, alignItems: "end", overflowX: "auto", paddingBottom: 6 }}>
            {chartBars.length === 0 ? (
              <div style={{ color: "#64748b" }}>No data for this range.</div>
            ) : (
              chartBars.map((bar) => (
                <div key={bar.key} style={{ minWidth: 58, display: "grid", gap: 7 }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "end", height: 184 }}>
                    <div
                      title={`${bar.key} accepted: ${bar.acceptedValue.toFixed(2)}`}
                      style={{
                        width: 24,
                        height: `${bar.acceptedHeightPct}%`,
                        minHeight: 6,
                        borderRadius: "8px 8px 3px 3px",
                        background: "linear-gradient(180deg, #10b981, #059669)",
                        boxShadow: "0 8px 20px rgba(16,185,129,0.30)",
                      }}
                    />
                    <div
                      title={`${bar.key} failed: ${bar.failedValue.toFixed(2)}`}
                      style={{
                        width: 24,
                        height: `${bar.failedHeightPct}%`,
                        minHeight: 6,
                        borderRadius: "8px 8px 3px 3px",
                        background: "linear-gradient(180deg, #f97316, #ea580c)",
                        boxShadow: "0 8px 20px rgba(249,115,22,0.28)",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>{bar.key}</div>
                </div>
              ))
            )}
          </div>
          <div style={{ display: "flex", gap: 12, color: "#64748b", fontSize: 12 }}>
            <span>Green: accepted</span>
            <span>Orange: failed</span>
          </div>
        </section>

        <section
          style={{
            borderRadius: 22,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.96)",
            padding: "16px",
            boxShadow: "0 16px 34px rgba(15,23,42,0.08)",
          }}
        >
          <h2 style={{ margin: 0, color: "#0f172a" }}>Provider drill-down</h2>
          <p style={{ margin: "6px 0 10px", color: "#64748b" }}>
            Click a provider to focus the dashboard on that account rail.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => setFilters((current) => ({ ...current, provider: "all" }))}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(15,23,42,0.16)",
                background: filters.provider === "all" ? "#0f172a" : "#fff",
                color: filters.provider === "all" ? "#fff" : "#0f172a",
                padding: "8px 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              All providers
            </button>
            {topProviders.map((row) => {
              const key = String(row.providerName || "").toLowerCase();
              const active = filters.provider === key;
              return (
                <button
                  key={row.providerName}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, provider: key }))}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(15,23,42,0.16)",
                    background: active ? "rgba(14,165,233,0.18)" : "#fff",
                    color: "#0f172a",
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {row.providerName}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b", fontSize: 12 }}>
                  <th style={{ padding: "8px 6px" }}>Provider</th>
                  <th style={{ padding: "8px 6px" }}>Accepted volume</th>
                  <th style={{ padding: "8px 6px" }}>Failed volume</th>
                  <th style={{ padding: "8px 6px" }}>Accepted</th>
                  <th style={{ padding: "8px 6px" }}>Failed</th>
                </tr>
              </thead>
              <tbody>
                {topProviders.map((row) => (
                  <tr key={row.providerName} style={{ borderTop: "1px solid rgba(15,23,42,0.07)" }}>
                    <td style={{ padding: "10px 6px", fontWeight: 700, color: "#0f172a" }}>{row.providerName}</td>
                    <td style={{ padding: "10px 6px", color: "#047857", fontWeight: 700 }}>
                      {formatCurrency(row.acceptedVolume || 0)}
                    </td>
                    <td style={{ padding: "10px 6px", color: "#b91c1c", fontWeight: 700 }}>
                      {formatCurrency(row.failedVolume || 0)}
                    </td>
                    <td style={{ padding: "10px 6px", color: "#334155" }}>{row.acceptedPayments}</td>
                    <td style={{ padding: "10px 6px", color: "#334155" }}>{row.failedPayments}</td>
                  </tr>
                ))}
                {topProviders.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "14px 6px", color: "#64748b" }}>
                      No provider stats for selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          style={{
            borderRadius: 22,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.96)",
            padding: "16px",
            boxShadow: "0 16px 34px rgba(15,23,42,0.08)",
          }}
        >
          <h2 style={{ margin: 0, color: "#0f172a" }}>Recent processing activity</h2>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b", fontSize: 12 }}>
                  <th style={{ padding: "8px 6px" }}>Provider</th>
                  <th style={{ padding: "8px 6px" }}>Method</th>
                  <th style={{ padding: "8px 6px" }}>Brand</th>
                  <th style={{ padding: "8px 6px" }}>Country</th>
                  <th style={{ padding: "8px 6px" }}>Interaction</th>
                  <th style={{ padding: "8px 6px" }}>Amount</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(payload.recentTransactions || []).map((tx) => (
                  <tr key={tx.id} style={{ borderTop: "1px solid rgba(15,23,42,0.07)" }}>
                    <td style={{ padding: "10px 6px", fontWeight: 700, color: "#0f172a" }}>{tx.providerName || "-"}</td>
                    <td style={{ padding: "10px 6px", color: "#334155" }}>{tx.methodType || "-"}</td>
                    <td style={{ padding: "10px 6px", color: "#334155" }}>{tx.brand || "-"}</td>
                    <td style={{ padding: "10px 6px", color: "#334155" }}>{tx.country || "-"}</td>
                    <td style={{ padding: "10px 6px", color: "#334155" }}>{tx.interactionType || "-"}</td>
                    <td style={{ padding: "10px 6px", color: "#0f172a", fontWeight: 700 }}>
                      {formatCurrency(tx.totalChargedAmount || tx.amount || 0, tx.currency || "USD")}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <span
                        style={{
                          borderRadius: 999,
                          padding: "4px 9px",
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          background:
                            tx.status === "paid"
                              ? "rgba(16,185,129,0.16)"
                              : tx.status === "failed"
                                ? "rgba(239,68,68,0.16)"
                                : "rgba(15,23,42,0.10)",
                          color:
                            tx.status === "paid"
                              ? "#047857"
                              : tx.status === "failed"
                                ? "#b91c1c"
                                : "#334155",
                        }}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {(payload.recentTransactions || []).length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} style={{ padding: "14px 6px", color: "#64748b" }}>
                      No transactions for selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
