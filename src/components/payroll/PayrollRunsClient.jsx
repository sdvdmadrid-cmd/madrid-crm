"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import PayrollNav from "@/components/payroll/PayrollNav";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function PayrollRunsClient() {
  const { t } = useTranslation();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/payroll/runs");
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Load failed");
      setRuns(payload.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const createRun = async () => {
    setCreating(true);
    setError("");
    const end = todayIso();
    const start = new Date();
    start.setDate(start.getDate() - 13);
    const body = {
      title: `Payroll ${end}`,
      scheduleType: "biweekly",
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end,
      payDate: end,
    };

    const res = await apiFetch("/api/payroll/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    setCreating(false);
    if (!res.ok || !payload.success) {
      setError(payload.error || "Unable to create pay run");
      return;
    }
    window.location.href = `/payroll/runs/${payload.data.id}`;
  };

  return (
    <main className={styles.page} data-testid="payroll-runs-page">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("payroll.runs.title")}</h1>
          <p className={styles.subtitle}>{t("payroll.runs.subtitle")}</p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={createRun}
          disabled={creating}
        >
          {creating ? t("payroll.actions.working") : t("payroll.runs.newRun")}
        </button>
      </header>

      <PayrollNav />
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.card}>
        {loading ? <p className={styles.muted}>{t("payroll.loading")}</p> : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("payroll.fields.title")}</th>
                <th>{t("payroll.fields.period")}</th>
                <th>{t("payroll.fields.payDate")}</th>
                <th>{t("payroll.fields.gross")}</th>
                <th>{t("payroll.fields.net")}</th>
                <th>{t("payroll.fields.status")}</th>
              </tr>
            </thead>
            <tbody>
              {!loading && runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.muted}>
                    {t("payroll.runs.empty", {
                      defaultValue: "No pay runs yet. Create your first run to get started.",
                    })}
                  </td>
                </tr>
              ) : null}
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link href={`/payroll/runs/${run.id}`}>{run.title}</Link>
                  </td>
                  <td>
                    {run.periodStart} – {run.periodEnd}
                  </td>
                  <td>{run.payDate}</td>
                  <td>{money(run.totals?.grossPay)}</td>
                  <td>{money(run.totals?.netPay)}</td>
                  <td>
                    <span className={styles.badge}>{run.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
