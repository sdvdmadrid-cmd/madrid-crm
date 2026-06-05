"use client";

import { useCallback, useEffect, useState } from "react";
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

const REPORT_TYPES = [
  { id: "date_range", labelKey: "payroll.reports.dateRange" },
  { id: "weekly", labelKey: "payroll.reports.weekly" },
  { id: "monthly", labelKey: "payroll.reports.monthly" },
  { id: "quarterly", labelKey: "payroll.reports.quarterly" },
  { id: "ytd", labelKey: "payroll.reports.ytd" },
];

export default function PayrollReportsClient() {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState("ytd");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/payroll/employees?status=active")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) setEmployees(payload.data || []);
      })
      .catch(() => {});
  }, []);

  const runReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ type: reportType });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (employeeId) params.set("employeeId", employeeId);

      const res = await apiFetch(`/api/payroll/reports?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Report failed");
      setReport(payload.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [reportType, startDate, endDate, employeeId]);

  const totals = report?.totals || {};

  return (
    <main className={styles.page} data-testid="payroll-reports-page">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("payroll.reports.title")}</h1>
          <p className={styles.subtitle}>{t("payroll.reports.subtitle")}</p>
        </div>
      </header>

      <PayrollNav />

      <section className={styles.card}>
        <div className={styles.grid2}>
          <select
            className={styles.fieldSelect}
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            {REPORT_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {t(type.labelKey)}
              </option>
            ))}
          </select>
          <select
            className={styles.fieldSelect}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">{t("payroll.reports.allEmployees")}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
          <input
            className={styles.field}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            className={styles.field}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnPrimary} onClick={runReport} disabled={loading}>
            {loading ? t("payroll.actions.working") : t("payroll.reports.run")}
          </button>
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      {report ? (
        <>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t("payroll.fields.gross")}</div>
              <div className={styles.statValue}>{money(totals.grossPay)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t("payroll.fields.net")}</div>
              <div className={styles.statValue}>{money(totals.netPay)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t("payroll.fields.employerTaxes")}</div>
              <div className={styles.statValue}>{money(totals.employerTaxes)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t("payroll.reports.employeeCount")}</div>
              <div className={styles.statValue}>{totals.employeeCount || 0}</div>
            </div>
          </div>

          {report.byEmployee?.length ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("payroll.reports.byEmployee")}</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("payroll.fields.name")}</th>
                      <th>{t("payroll.fields.gross")}</th>
                      <th>{t("payroll.fields.net")}</th>
                      <th>{t("payroll.fields.employerTaxes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byEmployee.map((row) => (
                      <tr key={row.employeeId}>
                        <td>{row.employee?.fullName || row.employeeId}</td>
                        <td>{money(row.totals.grossPay)}</td>
                        <td>{money(row.totals.netPay)}</td>
                        <td>{money(row.totals.employerTaxes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {report.byPeriod?.length ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("payroll.reports.byPeriod")}</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("payroll.fields.period")}</th>
                      <th>{t("payroll.fields.gross")}</th>
                      <th>{t("payroll.fields.net")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byPeriod.map((row) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        <td>{money(row.totals.grossPay)}</td>
                        <td>{money(row.totals.netPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
