"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import styles from "./page.module.css";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return dateFormatter.format(parsed);
}

export default function RevenueDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    totalRevenue: 0,
    totalPayments: 0,
    recentPayments: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      const sessionRes = await apiFetch("/api/auth/me", {
        suppressUnauthorizedEvent: true,
      });
      const sessionPayload = await getJsonOrThrow(
        sessionRes,
        "Failed to load session.",
      );
      const contractorId = String(
        sessionPayload?.data?.tenantDbId || sessionPayload?.data?.userId || "",
      );

      if (!contractorId) {
        setError("Missing contractor id for revenue dashboard.");
        setData({
          totalRevenue: 0,
          totalPayments: 0,
          recentPayments: [],
        });
        setLoading(false);
        return;
      }

      const { data: payload, error: rpcError } = await supabase.rpc(
        "get_revenue_dashboard",
        {
          contractor_id: contractorId,
          limit_count: 10,
        },
      );

      if (cancelled) {
        return;
      }

      if (rpcError) {
        setError(rpcError.message || "Failed to load revenue dashboard.");
        setData({
          totalRevenue: 0,
          totalPayments: 0,
          recentPayments: [],
        });
        setLoading(false);
        return;
      }

      setData({
        totalRevenue: Number(payload?.totalRevenue || 0),
        totalPayments: Number(payload?.totalPayments || 0),
        recentPayments: Array.isArray(payload?.recentPayments)
          ? payload.recentPayments
          : [],
      });
      setLoading(false);
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Revenue overview</p>
          <h1 className={styles.title}>Payments dashboard</h1>
          <p className={styles.subtitle}>
            Live revenue metrics powered directly by your Supabase payments data.
          </p>
        </div>
      </section>

      {loading ? (
        <section className={styles.stateCard}>
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.stateTitle}>Loading dashboard</p>
          <p className={styles.stateText}>
            Fetching total revenue, payment count, and recent activity.
          </p>
        </section>
      ) : error ? (
        <section className={styles.errorCard}>
          <p className={styles.stateTitle}>Unable to load dashboard</p>
          <p className={styles.stateText}>{error}</p>
        </section>
      ) : (
        <>
          <section className={styles.metricsGrid}>
            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>Total Revenue</p>
              <p className={styles.metricValue}>
                {formatCurrency(data.totalRevenue)}
              </p>
              <p className={styles.metricHint}>From paid payments only</p>
            </article>

            <article className={styles.metricCard}>
              <p className={styles.metricLabel}>Total Payments</p>
              <p className={styles.metricValue}>{data.totalPayments}</p>
              <p className={styles.metricHint}>All successful payment records</p>
            </article>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Latest activity</p>
                <h2 className={styles.panelTitle}>Recent payments</h2>
              </div>
            </div>

            {data.recentPayments.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.stateTitle}>No paid payments yet</p>
                <p className={styles.stateText}>
                  Recent transactions will appear here once paid records exist in
                  the payments table.
                </p>
              </div>
            ) : (
              <div className={styles.list}>
                {data.recentPayments.map((payment) => (
                  <article
                    key={payment.id || `${payment.created_at}-${payment.amount}`}
                    className={styles.listRow}
                  >
                    <div>
                      <p className={styles.rowAmount}>
                        {formatCurrency(payment.amount)}
                      </p>
                      <p className={styles.rowMeta}>
                        {payment.contractor_id || "All contractors"}
                      </p>
                    </div>
                    <p className={styles.rowDate}>
                      {formatDate(payment.created_at)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}