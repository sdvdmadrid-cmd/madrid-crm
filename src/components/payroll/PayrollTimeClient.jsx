"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PayrollNav from "@/components/payroll/PayrollNav";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

export default function PayrollTimeClient() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [jobId, setJobId] = useState("");
  const [hours, setHours] = useState("");
  const [entryType, setEntryType] = useState("regular");
  const [hourlyRate, setHourlyRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [employeesRes, entriesRes] = await Promise.all([
        apiFetch("/api/payroll/employees?status=active"),
        apiFetch("/api/payroll/time-entries?limit=50"),
      ]);
      const employeesPayload = await employeesRes.json();
      const entriesPayload = await entriesRes.json();
      if (employeesPayload.success) {
        setEmployees(employeesPayload.data || []);
        if (!employeeId && employeesPayload.data?.[0]?.id) {
          setEmployeeId(employeesPayload.data[0].id);
          setHourlyRate(String(employeesPayload.data[0].hourlyRate || ""));
        }
      }
      if (entriesPayload.success) {
        setEntries(entriesPayload.data?.items || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const postAction = async (body) => {
    setError("");
    setNotice("");
    const res = await apiFetch("/api/payroll/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || "Request failed");
      return;
    }
    setNotice(t("payroll.time.saved"));
    await loadData();
  };

  const clockIn = async () => {
    let metadata = {};
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
          });
        });
        metadata = {
          gps: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: new Date().toISOString(),
          },
        };
        setNotice(t("payroll.time.gpsEnabled"));
      } catch {
        setNotice(t("payroll.time.gpsDenied"));
      }
    }
    await postAction({
      action: "clock_in",
      employeeId,
      jobId: jobId || undefined,
      hourlyRate: Number(hourlyRate || 0),
      metadata,
    });
  };

  const clockOut = () =>
    postAction({
      action: "clock_out",
      employeeId,
    });

  const saveManual = () =>
    postAction({
      action: "manual",
      employeeId,
      jobId: jobId || undefined,
      entryType,
      hours: Number(hours || 0),
      hourlyRate: Number(hourlyRate || 0),
    });

  return (
    <main className={styles.page} data-testid="payroll-time-page">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("payroll.time.title")}</h1>
          <p className={styles.subtitle}>{t("payroll.time.subtitle")}</p>
        </div>
      </header>

      <PayrollNav />

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.time.clockTitle")}</h2>
        <div className={styles.grid2}>
          <select
            className={styles.fieldSelect}
            value={employeeId}
            onChange={(e) => {
              const id = e.target.value;
              setEmployeeId(id);
              const employee = employees.find((row) => row.id === id);
              setHourlyRate(String(employee?.hourlyRate || ""));
            }}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
          <input
            className={styles.field}
            placeholder={t("payroll.time.jobIdOptional")}
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
          />
          <input
            className={styles.field}
            type="number"
            min="0"
            step="0.01"
            placeholder={t("payroll.fields.hourlyRate")}
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
          />
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnPrimary} onClick={clockIn}>
            {t("payroll.time.clockIn")}
          </button>
          <button type="button" className={styles.btnGhost} onClick={clockOut}>
            {t("payroll.time.clockOut")}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.time.manualTitle")}</h2>
        <div className={styles.grid2}>
          <select
            className={styles.fieldSelect}
            value={entryType}
            onChange={(e) => setEntryType(e.target.value)}
          >
            <option value="regular">{t("payroll.time.regular")}</option>
            <option value="overtime">{t("payroll.time.overtime")}</option>
            <option value="pto">{t("payroll.time.pto")}</option>
            <option value="sick">{t("payroll.time.sick")}</option>
          </select>
          <input
            className={styles.field}
            type="number"
            min="0"
            step="0.25"
            placeholder={t("payroll.fields.hours")}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnPrimary} onClick={saveManual}>
            {t("payroll.time.saveEntry")}
          </button>
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.time.recentTitle")}</h2>
        {loading ? <p className={styles.muted}>{t("payroll.loading")}</p> : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("payroll.fields.status")}</th>
                <th>{t("payroll.time.entryType")}</th>
                <th>{t("payroll.fields.hours")}</th>
                <th>{t("payroll.time.clockIn")}</th>
                <th>{t("payroll.time.clockOut")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.status}</td>
                  <td>{entry.entryType}</td>
                  <td>{entry.hours}</td>
                  <td>{entry.clockIn ? new Date(entry.clockIn).toLocaleString() : "—"}</td>
                  <td>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
