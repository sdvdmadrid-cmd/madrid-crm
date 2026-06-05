"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function PayrollRunDetailClient({ runId }) {
  const { t } = useTranslation();
  const [run, setRun] = useState(null);
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [draftRows, setDraftRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [achBatches, setAchBatches] = useState([]);

  const isMutable = useMemo(
    () => run && ["draft", "calculated"].includes(run.status),
    [run],
  );

  const loadRun = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [runRes, employeesRes, jobsRes] = await Promise.all([
        apiFetch(`/api/payroll/runs/${runId}`),
        apiFetch("/api/payroll/employees?status=active"),
        apiFetch("/api/jobs?limit=100"),
      ]);
      const runPayload = await runRes.json();
      const employeesPayload = await employeesRes.json();
      const jobsPayload = await jobsRes.json();
      if (!runRes.ok || !runPayload.success) {
        throw new Error(runPayload.error || "Unable to load pay run");
      }
      setRun(runPayload.data.run);
      setItems(runPayload.data.items || []);
      setDraftRows(
        (runPayload.data.items || []).map((item) => ({
          id: item.id,
          employeeId: item.employeeId,
          hoursRegular: String(item.hoursRegular ?? ""),
          hoursOvertime: String(item.hoursOvertime ?? "0"),
          hourlyRate: String(item.hourlyRate ?? item.employee?.hourlyRate ?? ""),
          jobId: item.jobId || "",
        })),
      );
      if (employeesRes.ok && employeesPayload.success) {
        setEmployees(employeesPayload.data || []);
      }
      if (jobsRes.ok && jobsPayload.success !== false) {
        const list = Array.isArray(jobsPayload)
          ? jobsPayload
          : jobsPayload.data || jobsPayload.items || [];
        setJobs(list);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  const loadAchBatches = useCallback(async () => {
    if (!runId) return;
    const res = await apiFetch(`/api/payroll/ach/batches?runId=${runId}`);
    const payload = await res.json();
    if (payload.success) setAchBatches(payload.data || []);
  }, [runId]);

  useEffect(() => {
    loadRun();
  }, [loadRun]);

  useEffect(() => {
    if (run && ["approved", "finalized"].includes(run.status)) {
      loadAchBatches();
    }
  }, [run, loadAchBatches]);

  const addEmployeeRow = () => {
    const first = employees[0];
    if (!first) return;
    setDraftRows((rows) => [
      ...rows,
      {
        employeeId: first.id,
        hoursRegular: "0",
        hoursOvertime: "0",
        hourlyRate: String(first.hourlyRate || ""),
      },
    ]);
  };

  const importTimeEntries = async () => {
    setWorking("import-time");
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/payroll/runs/${runId}/import-time`, {
        method: "POST",
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "Unable to import time entries");
      }
      const data = payload.data || {};
      const count = data.importedCount || 0;
      if (data.autoSplitOvertime && data.autoSplitCount > 0) {
        setNotice(
          t("payroll.runs.timeImportedWithSplit", {
            count,
            split: data.autoSplitCount,
          }),
        );
      } else {
        setNotice(t("payroll.runs.timeImported", { count }));
      }
      await loadRun();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking("");
    }
  };

  const saveLines = async () => {
    setWorking("save");
    setError("");
    const res = await apiFetch(`/api/payroll/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: draftRows.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          hoursRegular: Number(row.hoursRegular || 0),
          hoursOvertime: Number(row.hoursOvertime || 0),
          hourlyRate: Number(row.hourlyRate || 0),
          jobId: row.jobId || null,
        })),
      }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Unable to save hours");
      return;
    }
    setRun(payload.data.run);
    setItems(payload.data.items || []);
    setNotice(t("payroll.runs.linesSaved"));
  };

  const calculateRun = async () => {
    setWorking("calculate");
    setError("");
    await saveLines();
    const res = await apiFetch(`/api/payroll/runs/${runId}/calculate`, {
      method: "POST",
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Calculation failed");
      return;
    }
    setRun(payload.data.run);
    setItems(payload.data.items || []);
    setNotice(t("payroll.runs.calculated"));
    await loadRun();
  };

  const approveRun = async () => {
    setWorking("approve");
    setError("");
    const res = await apiFetch(`/api/payroll/runs/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Approval failed");
      return;
    }
    setRun(payload.data);
    setNotice(t("payroll.runs.approved"));
  };

  const achAction = async (action, batchId) => {
    setWorking(`ach-${action}`);
    setError("");
    const res = await apiFetch("/api/payroll/ach/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, runId, batchId }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "ACH action failed");
      return;
    }
    if (action === "export" && payload.data?.fileContent) {
      const blob = new Blob([payload.data.fileContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = payload.data.fileName || "ach_export.txt";
      link.click();
      URL.revokeObjectURL(url);
      setNotice(t("payroll.runs.achExported"));
    }
    await loadAchBatches();
  };

  const exportAch = async () => {
    setWorking("ach");
    setError("");
    const res = await apiFetch("/api/payroll/ach/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "ACH export failed");
      return;
    }
    const blob = new Blob([payload.data.fileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = payload.data.fileName || "ach_export.txt";
    link.click();
    URL.revokeObjectURL(url);
    setNotice(t("payroll.runs.achExported"));
    await loadAchBatches();
  };

  const sendStub = async (item) => {
    setWorking(`email-${item.id}`);
    setError("");
    const res = await apiFetch(
      `/api/payroll/runs/${runId}/items/${item.id}/send-stub`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: item.employee?.email }),
      },
    );
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Email failed");
      return;
    }
    setNotice(t("payroll.runs.stubEmailed"));
  };

  const finalizeRun = async () => {
    setWorking("finalize");
    setError("");
    const res = await apiFetch(`/api/payroll/runs/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finalize" }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Finalize failed");
      return;
    }
    setRun(payload.data);
    setNotice(t("payroll.runs.finalized"));
    await loadRun();
  };

  const voidRun = async () => {
    const reason = window.prompt("Reason for voiding this pay run:");
    if (reason == null) return;
    setWorking("void");
    setError("");
    const res = await apiFetch("/api/payroll/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void", runId, reason }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Void failed");
      return;
    }
    setNotice(t("payroll.runs.voided"));
    await loadRun();
  };

  const createCorrection = async () => {
    setWorking("correction");
    setError("");
    const res = await apiFetch("/api/payroll/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "correction",
        originalRunId: runId,
        title: `Correction — ${run?.title || runId}`,
      }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Correction failed");
      return;
    }
    setNotice(t("payroll.runs.correctionCreated"));
    if (payload.data?.id) {
      window.location.href = `/payroll/runs/${payload.data.id}`;
    }
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <p className={styles.muted}>{t("payroll.loading")}</p>
      </main>
    );
  }

  if (!run) {
    return (
      <main className={styles.page}>
        <div className={styles.error}>{error || t("payroll.runs.notFound")}</div>
      </main>
    );
  }

  const totals = run.totals || {};

  return (
    <main className={styles.page} data-testid="payroll-run-detail">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{run.title}</h1>
          <p className={styles.subtitle}>
            {run.periodStart} – {run.periodEnd} · {t("payroll.fields.payDate")}{" "}
            {run.payDate}
          </p>
        </div>
        <Link href="/payroll/runs" className={styles.btnGhost}>
          {t("payroll.runs.backToList")}
        </Link>
      </header>

      <PayrollNav />

      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("payroll.fields.status")}</div>
          <div className={styles.statValue}>{run.status}</div>
        </div>
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
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

      {isMutable ? (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t("payroll.runs.enterHours")}</h2>
          {draftRows.map((row, index) => (
            <div key={`${row.employeeId}-${index}`} className={styles.grid2}>
              <select
                className={styles.fieldSelect}
                value={row.employeeId}
                onChange={(e) => {
                  const employeeId = e.target.value;
                  const employee = employees.find((item) => item.id === employeeId);
                  setDraftRows((rows) =>
                    rows.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            employeeId,
                            hourlyRate: String(employee?.hourlyRate || entry.hourlyRate),
                          }
                        : entry,
                    ),
                  );
                }}
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} ({money(employee.hourlyRate)}/hr)
                  </option>
                ))}
              </select>
              <input
                className={styles.field}
                type="number"
                min="0"
                step="0.25"
                placeholder={t("payroll.fields.regularHours")}
                value={row.hoursRegular}
                onChange={(e) =>
                  setDraftRows((rows) =>
                    rows.map((entry, i) =>
                      i === index ? { ...entry, hoursRegular: e.target.value } : entry,
                    ),
                  )
                }
              />
              <input
                className={styles.field}
                type="number"
                min="0"
                step="0.25"
                placeholder={t("payroll.fields.overtimeHours")}
                value={row.hoursOvertime}
                onChange={(e) =>
                  setDraftRows((rows) =>
                    rows.map((entry, i) =>
                      i === index ? { ...entry, hoursOvertime: e.target.value } : entry,
                    ),
                  )
                }
              />
              <input
                className={styles.field}
                type="number"
                min="0"
                step="0.01"
                placeholder={t("payroll.fields.hourlyRate")}
                value={row.hourlyRate}
                onChange={(e) =>
                  setDraftRows((rows) =>
                    rows.map((entry, i) =>
                      i === index ? { ...entry, hourlyRate: e.target.value } : entry,
                    ),
                  )
                }
              />
              <select
                className={styles.fieldSelect}
                value={row.jobId || ""}
                onChange={(e) =>
                  setDraftRows((rows) =>
                    rows.map((entry, i) =>
                      i === index ? { ...entry, jobId: e.target.value } : entry,
                    ),
                  )
                }
              >
                <option value="">{t("payroll.fields.noJob")}</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title || job.clientName || job.id}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.btnGhost}
              data-testid="payroll-import-time"
              disabled={working === "import-time"}
              onClick={importTimeEntries}
            >
              {working === "import-time"
                ? t("payroll.actions.working")
                : t("payroll.runs.importTime")}
            </button>
            <button type="button" className={styles.btnGhost} onClick={addEmployeeRow}>
              {t("payroll.runs.addEmployeeLine")}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={working === "save"}
              onClick={saveLines}
            >
              {t("payroll.actions.saveHours")}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={working === "calculate"}
              onClick={calculateRun}
            >
              {t("payroll.actions.calculate")}
            </button>
          </div>
        </section>
      ) : null}

      <section className={styles.card} data-testid="payroll-run-summary">
        <h2 className={styles.cardTitle}>{t("payroll.runs.summaryTitle")}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("payroll.fields.name")}</th>
                <th>{t("payroll.fields.hours")}</th>
                <th>{t("payroll.fields.gross")}</th>
                <th>{t("payroll.fields.federal")}</th>
                <th>{t("payroll.fields.state")}</th>
                <th>{t("payroll.fields.socialSecurity")}</th>
                <th>{t("payroll.fields.medicare")}</th>
                <th>{t("payroll.fields.net")}</th>
                <th>{t("payroll.fields.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.employee?.fullName || item.employeeId}</td>
                  <td>{item.hoursRegular}</td>
                  <td>{money(item.grossPay)}</td>
                  <td>{money(item.deductions?.federalWithholding)}</td>
                  <td>{money(item.deductions?.stateWithholding)}</td>
                  <td>{money(item.deductions?.socialSecurity)}</td>
                  <td>{money(item.deductions?.medicare)}</td>
                  <td>{money(item.netPay)}</td>
                  <td>
                    {["calculated", "approved", "finalized"].includes(run.status) ? (
                      <div className={styles.formActions}>
                        <a
                          href={`/api/payroll/runs/${runId}/items/${item.id}/pdf?download=1`}
                          className={styles.linkBtn}
                        >
                          {t("payroll.actions.downloadStub")}
                        </a>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          disabled={working === `email-${item.id}`}
                          onClick={() => sendStub(item)}
                        >
                          {t("payroll.actions.emailStub")}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.formActions}>
          {run.status === "approved" || run.status === "finalized" ? (
            <>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={working === "ach"}
                onClick={exportAch}
              >
                {t("payroll.actions.exportAch")}
              </button>
              {!achBatches.length ? (
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={working === "ach-create_draft"}
                  onClick={() => achAction("create_draft")}
                >
                  Create ACH draft
                </button>
              ) : null}
            </>
          ) : null}
          {achBatches[0] ? (
            <div className={styles.formActions}>
              <span className={styles.muted}>
                ACH: {achBatches[0].status} — ${Number(achBatches[0].totalAmount || 0).toFixed(2)}
              </span>
              {achBatches[0].status === "draft" ? (
                <button type="button" className={styles.btnGhost} onClick={() => achAction("submit", achBatches[0].id)}>
                  Submit for review
                </button>
              ) : null}
              {achBatches[0].status === "pending_review" ? (
                <button type="button" className={styles.btnPrimary} onClick={() => achAction("approve", achBatches[0].id)}>
                  Approve ACH
                </button>
              ) : null}
              {["approved", "draft", "pending_review"].includes(achBatches[0].status) ? (
                <button type="button" className={styles.btnGhost} onClick={() => achAction("export", achBatches[0].id)}>
                  Export file
                </button>
              ) : null}
              {achBatches[0].status === "exported" ? (
                <button type="button" className={styles.btnGhost} onClick={() => achAction("transmit", achBatches[0].id)}>
                  Mark transmitted
                </button>
              ) : null}
            </div>
          ) : null}
          {run.status === "calculated" ? (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={working === "approve"}
              onClick={approveRun}
            >
              {t("payroll.actions.approve")}
            </button>
          ) : null}
          {run.status === "approved" ? (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={working === "finalize"}
              onClick={finalizeRun}
            >
              {t("payroll.actions.finalize")}
            </button>
          ) : null}
          {["approved", "finalized"].includes(run.status) ? (
            <>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={working === "void"}
                onClick={voidRun}
              >
                {t("payroll.actions.voidRun")}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={working === "correction"}
                onClick={createCorrection}
              >
                {t("payroll.actions.createCorrection")}
              </button>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
