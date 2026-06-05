"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import PayrollNav from "@/components/payroll/PayrollNav";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function PayrollOverviewClient() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [metricsRes, remindersRes] = await Promise.all([
        apiFetch("/api/payroll/dashboard"),
        apiFetch("/api/payroll/reminders"),
      ]);
      const payload = await metricsRes.json();
      const remindersPayload = await remindersRes.json();
      if (!metricsRes.ok || !payload.success) throw new Error(payload.error || "Load failed");
      setMetrics(payload.data);
      if (remindersPayload.success) setReminders(remindersPayload.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const week = metrics?.thisWeek || {};
  const month = metrics?.thisMonth || {};

  return (
    <main className={styles.page} data-testid="payroll-overview">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("payroll.title")}</h1>
          <p className={styles.subtitle}>{t("payroll.dashboard.subtitle")}</p>
        </div>
        <div className={styles.formActions}>
          <Link href="/payroll/runs" className={styles.btnPrimary}>
            {t("payroll.runs.newRun")}
          </Link>
        </div>
      </header>

      <PayrollNav />

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? <p className={styles.muted}>{t("payroll.loading")}</p> : null}

      {metrics ? (
        <>
          <div className={styles.statGrid} data-testid="payroll-dashboard-metrics">
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t("payroll.dashboard.employeeCount")}</div>
              <div className={styles.statValue}>{metrics.employeeCount}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t("payroll.dashboard.weekPayroll")}</div>
              <div className={styles.statValue}>{money(week.grossPay)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t("payroll.dashboard.monthPayroll")}</div>
              <div className={styles.statValue}>{money(month.grossPay)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t("payroll.dashboard.employerTaxLiability")}</div>
              <div className={styles.statValue}>{money(metrics.employerTaxLiability)}</div>
            </div>
          </div>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("payroll.dashboard.upcomingRuns")}</h2>
            {reminders.length ? (
              <ul className={styles.muted}>
                {reminders.slice(0, 3).map((reminder) => (
                  <li key={reminder.id}>
                    {reminder.title} — due {reminder.dueDate}
                  </li>
                ))}
              </ul>
            ) : null}
            {metrics.upcomingRuns?.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("payroll.fields.title")}</th>
                      <th>{t("payroll.fields.payDate")}</th>
                      <th>{t("payroll.fields.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.upcomingRuns.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <Link href={`/payroll/runs/${run.id}`}>{run.title}</Link>
                        </td>
                        <td>{run.payDate}</td>
                        <td>
                          <span className={styles.badge}>{run.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.muted}>{t("payroll.dashboard.noUpcoming")}</p>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("payroll.dashboard.quickLinks")}</h2>
            <div className={styles.formActions}>
              <Link href="/payroll/employees" className={styles.btnGhost}>
                {t("payroll.nav.employees")}
              </Link>
              <Link href="/payroll/time" className={styles.btnGhost}>
                {t("payroll.nav.time")}
              </Link>
              <Link href="/payroll/calendar" className={styles.btnGhost}>
                {t("payroll.nav.calendar")}
              </Link>
              <Link href="/payroll/reports" className={styles.btnGhost}>
                {t("payroll.nav.reports")}
              </Link>
              <Link href="/portal/payroll" className={styles.btnGhost}>
                {t("payroll.portal.title")}
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
