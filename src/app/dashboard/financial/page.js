"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/dashboard/page.module.css";

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(v || 0),
  );
}

export default function ExecutiveFinancialPage() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/dashboard/financial");
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Load failed");
      setMetrics(payload.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <main className={styles.page}><p>Loading executive dashboard…</p></main>;
  if (error) return <main className={styles.page}><p>{error}</p></main>;
  if (!metrics) return null;

  return (
    <main className={styles.page} data-testid="executive-financial-dashboard">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Executive dashboard · {metrics.monthLabel}</p>
          <h1 className={styles.title}>Business P&L</h1>
        </div>
        <Link href="/dashboard" className={styles.secondaryAction}>← Main dashboard</Link>
      </header>

      <div className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Revenue this month</p>
          <p className={styles.metricValue}>{money(metrics.revenueThisMonth)}</p>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Payroll this month</p>
          <p className={styles.metricValue}>{money(metrics.payrollThisMonth)}</p>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Expenses this month</p>
          <p className={styles.metricValue}>{money(metrics.expensesThisMonth)}</p>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Gross profit</p>
          <p className={styles.metricValue}>{money(metrics.grossProfit)} ({metrics.grossMargin}%)</p>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Accounts receivable</p>
          <p className={styles.metricValue}>{money(metrics.accountsReceivable)}</p>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.metricLabel}>Outstanding invoices</p>
          <p className={styles.metricValue}>{metrics.outstandingInvoices}</p>
        </article>
      </div>

      <section className={styles.panel}>
        <h2>Job pipeline</h2>
        <p>
          {metrics.jobPipeline.total} total · {metrics.jobPipeline.active} active ·{" "}
          {metrics.jobPipeline.pending} pending · {metrics.jobPipeline.completed} completed
        </p>
      </section>

      {metrics.losingJobs?.length ? (
        <section className={styles.panel}>
          <h2>Jobs losing money</h2>
          <ul>
            {metrics.losingJobs.map((job) => (
              <li key={job.jobId}>
                <Link href={`/jobs/${job.jobId}/financial`}>{job.jobTitle}</Link> — {money(job.grossProfit)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2>Top profitable projects</h2>
        <ul>
          {(metrics.topProfitableJobs || []).map((job) => (
            <li key={job.jobId}>
              <Link href={`/jobs/${job.jobId}/financial`}>{job.jobTitle}</Link> — {money(job.grossProfit)} ({job.marginPercent}%)
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
