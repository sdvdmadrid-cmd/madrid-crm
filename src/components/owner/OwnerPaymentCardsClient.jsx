"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { isClientLoggedOut } from "@/lib/auth-logout-guard.js";
import {
  formatPaymentMethodLabel,
  paymentMethodIcon,
} from "@/lib/payment-method-labels";
import styles from "./OwnerPaymentCardsClient.module.css";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function defaultFromDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 89);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function OwnerPaymentCardsClient() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(todayIso);
  const [methodType, setMethodType] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (isClientLoggedOut()) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, methodType, search });
      const response = await apiFetch(
        `/api/admin/payment-cards?${params.toString()}`,
      );
      const payload = await getJsonOrThrow(
        response,
        "Unable to load payment card analytics.",
      );
      setData(payload.data);
    } catch (err) {
      setError(err.message || "Unable to load data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, methodType, search]);

  useEffect(() => {
    if (isClientLoggedOut()) return undefined;
    load();
  }, [load]);

  const maxBarVolume = useMemo(() => {
    const series = data?.timeSeries || [];
    return Math.max(...series.map((row) => row.volume || 0), 1);
  }, [data?.timeSeries]);

  if (loading && !data) {
    return <div className={styles.loading}>{t("loading")}</div>;
  }

  if (error && !data) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button type="button" className={styles.btnRefresh} onClick={load}>
          {t("ownerPaymentCards.retry")}
        </button>
      </div>
    );
  }

  const summary = data?.summary || {};

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{t("ownerPaymentCards.title")}</h1>
        <p className={styles.heroSub}>{t("ownerPaymentCards.subtitle")}</p>
      </section>

      <div className={styles.filters}>
        <label>
          {t("ownerPaymentCards.from")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t("ownerPaymentCards.to")}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          {t("ownerPaymentCards.type")}
          <select
            value={methodType}
            onChange={(e) => setMethodType(e.target.value)}
          >
            <option value="all">{t("ownerPaymentCards.allTypes")}</option>
            <option value="card">{t("ownerPaymentCards.cardsOnly")}</option>
            <option value="bank_account">{t("ownerPaymentCards.banksOnly")}</option>
          </select>
        </label>
        <label>
          {t("ownerPaymentCards.search")}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ownerPaymentCards.searchPlaceholder")}
          />
        </label>
        <button
          type="button"
          className={styles.btnRefresh}
          onClick={load}
          disabled={loading}
        >
          {loading ? t("loading") : t("ownerPaymentCards.refresh")}
        </button>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>
            {t("ownerPaymentCards.metrics.methods")}
          </div>
          <div className={styles.metricValue}>{summary.totalMethods ?? 0}</div>
          <div className={styles.metricHint}>
            {summary.activeCards ?? 0} {t("ownerPaymentCards.metrics.cards")} ·{" "}
            {summary.activeBanks ?? 0} {t("ownerPaymentCards.metrics.banks")}
          </div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>
            {t("ownerPaymentCards.metrics.tenants")}
          </div>
          <div className={styles.metricValue}>
            {summary.tenantsWithMethods ?? 0}
          </div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>
            {t("ownerPaymentCards.metrics.volume")}
          </div>
          <div className={styles.metricValue}>
            {formatCurrency(summary.totalVolume)}
          </div>
          <div className={styles.metricHint}>
            {t("ownerPaymentCards.metrics.cardVolume")}{" "}
            {formatCurrency(summary.cardVolume)}
          </div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>
            {t("ownerPaymentCards.metrics.payments")}
          </div>
          <div className={styles.metricValue}>
            {summary.totalPayments ?? 0}
          </div>
          <div className={styles.metricHint}>
            {summary.paidPayments ?? 0} {t("ownerPaymentCards.metrics.paid")} ·{" "}
            {summary.failedPayments ?? 0} {t("ownerPaymentCards.metrics.failed")}
          </div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>
            {t("ownerPaymentCards.metrics.autopay")}
          </div>
          <div className={styles.metricValue}>
            {summary.autopayEnabledMethods ?? 0}
          </div>
        </div>
      </div>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {t("ownerPaymentCards.volumeTrend")}
          </h2>
          {(data?.timeSeries || []).length === 0 ? (
            <p className={styles.metricHint}>{t("ownerPaymentCards.noData")}</p>
          ) : (
            <div className={styles.chartBars}>
              {(data.timeSeries || []).slice(-14).map((row) => (
                <div key={row.date} className={styles.barWrap}>
                  <div
                    className={styles.bar}
                    style={{
                      height: `${Math.max(8, (row.volume / maxBarVolume) * 100)}%`,
                    }}
                    title={`${row.date}: ${formatCurrency(row.volume)}`}
                  />
                  <span className={styles.barLabel}>
                    {row.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            {t("ownerPaymentCards.brandMix")}
          </h2>
          <div className={styles.brandList}>
            {(data?.brandBreakdown || []).map((row) => (
              <div key={row.brand} className={styles.brandRow}>
                <span>{row.brand || "—"}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
            {(data?.brandBreakdown || []).length === 0 && (
              <p className={styles.metricHint}>{t("ownerPaymentCards.noData")}</p>
            )}
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          {t("ownerPaymentCards.topTenants")}
        </h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("ownerPaymentCards.table.tenant")}</th>
                <th>{t("ownerPaymentCards.table.methods")}</th>
                <th>{t("ownerPaymentCards.table.payments")}</th>
                <th>{t("ownerPaymentCards.table.volume")}</th>
                <th>{t("ownerPaymentCards.table.failed")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topTenants || []).map((row) => (
                <tr key={row.tenantId}>
                  <td className={styles.truncate} title={row.tenantId}>
                    {row.tenantId?.slice(0, 8)}…
                  </td>
                  <td>{row.methodCount}</td>
                  <td>{row.paymentCount}</td>
                  <td>{formatCurrency(row.volume)}</td>
                  <td>{row.failedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          {t("ownerPaymentCards.allMethods")} ({(data?.methods || []).length})
        </h2>
        {summary.transactionsTruncated && (
          <p className={styles.metricHint} style={{ marginBottom: 12 }}>
            {t("ownerPaymentCards.truncated")}
          </p>
        )}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th />
                <th>{t("ownerPaymentCards.table.user")}</th>
                <th>{t("ownerPaymentCards.table.method")}</th>
                <th>{t("ownerPaymentCards.table.type")}</th>
                <th>{t("ownerPaymentCards.table.usage")}</th>
                <th>{t("ownerPaymentCards.table.volume")}</th>
                <th>{t("ownerPaymentCards.table.lastUsed")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.methods || []).map((method) => (
                <tr key={method.id}>
                  <td>{paymentMethodIcon(method)}</td>
                  <td className={styles.truncate} title={method.userEmail}>
                    {method.userEmail || method.userId?.slice(0, 8)}
                  </td>
                  <td>{formatPaymentMethodLabel(method)}</td>
                  <td>
                    <span
                      className={`${styles.pill} ${
                        method.methodType === "card"
                          ? styles.pillCard
                          : styles.pillBank
                      }`}
                    >
                      {method.methodType}
                    </span>
                    {method.isDefault && (
                      <span
                        className={`${styles.pill} ${styles.pillActive}`}
                        style={{ marginLeft: 6 }}
                      >
                        default
                      </span>
                    )}
                  </td>
                  <td>{method.usage?.paymentCount ?? 0}</td>
                  <td>{formatCurrency(method.usage?.volume)}</td>
                  <td>{formatDate(method.usage?.lastUsedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
