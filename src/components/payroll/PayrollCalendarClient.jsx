"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PayrollNav from "@/components/payroll/PayrollNav";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

export default function PayrollCalendarClient() {
  const { t } = useTranslation();
  const [schedule, setSchedule] = useState("");
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = schedule ? `?schedule=${encodeURIComponent(schedule)}&count=8` : "?count=8";
      const res = await apiFetch(`/api/payroll/calendar${query}`);
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load calendar");
      }
      if (!schedule && payload.data?.settings?.defaultPaySchedule) {
        setSchedule(payload.data.settings.defaultPaySchedule);
      }
      setPeriods(payload.data?.periods || []);
    } catch (err) {
      setError(err.message || "Unable to load calendar");
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, [schedule]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className={styles.page} data-testid="payroll-calendar-page">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("payroll.calendar.title")}</h1>
          <p className={styles.subtitle}>{t("payroll.calendar.subtitle")}</p>
        </div>
      </header>

      <PayrollNav />
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.card}>
        <select
          className={styles.fieldSelect}
          value={schedule || "biweekly"}
          onChange={(e) => setSchedule(e.target.value)}
        >
          <option value="weekly">{t("payroll.reports.weekly")}</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="semimonthly">Semi-monthly</option>
          <option value="monthly">{t("payroll.reports.monthly")}</option>
        </select>
      </section>

      {loading ? <p className={styles.muted}>{t("payroll.loading")}</p> : null}

      <section className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("payroll.fields.period")}</th>
                <th>{t("payroll.fields.payDate")}</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={`${period.periodStart}-${period.periodEnd}`}>
                  <td>
                    {period.periodStart} – {period.periodEnd}
                  </td>
                  <td>{period.payDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
