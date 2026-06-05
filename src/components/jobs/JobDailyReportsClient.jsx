"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import JobWorkspaceNav from "@/components/jobs/JobWorkspaceNav";
import jobStyles from "@/app/jobs/jobs.module.css";
import "@/i18n";

const EMPTY_REPORT = {
  reportDate: new Date().toISOString().slice(0, 10),
  crewName: "",
  crewHours: "8",
  materials: "",
  equipment: "",
  weather: "",
  notes: "",
};

export default function JobDailyReportsClient({ jobId }) {
  const { t } = useTranslation();
  const [job, setJob] = useState(null);
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [jobRes, reportsRes] = await Promise.all([
        apiFetch(`/api/jobs/${jobId}`),
        apiFetch(`/api/jobs/${jobId}/daily-reports`),
      ]);
      const jobPayload = await jobRes.json();
      const reportsPayload = await reportsRes.json();
      if (!jobRes.ok) throw new Error(jobPayload.error || "Job not found");
      if (!reportsRes.ok || !reportsPayload.success) {
        throw new Error(reportsPayload.error || "Unable to load daily reports");
      }
      setJob(jobPayload);
      setReports(reportsPayload.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveReport = async () => {
    setError("");
    setNotice("");
    const crew =
      form.crewName.trim()
        ? [{ name: form.crewName.trim(), hours: Number(form.crewHours || 0) }]
        : [];

    const res = await apiFetch(`/api/jobs/${jobId}/daily-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDate: form.reportDate,
        crew,
        materials: form.materials,
        equipment: form.equipment,
        weather: form.weather,
        notes: form.notes,
      }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || "Unable to save daily report");
      return;
    }
    setForm(EMPTY_REPORT);
    setNotice(t("jobs.dailyReports.saved"));
    await load();
  };

  if (loading) {
    return (
      <main className={jobStyles.financialPage}>
        <p className={jobStyles.plMuted}>{t("jobs.dailyReports.loading")}</p>
      </main>
    );
  }

  return (
    <main className={jobStyles.financialPage} data-testid="job-daily-reports-page">
      <header className={jobStyles.financialHeader}>
        <div>
          <Link href="/jobs" className={jobStyles.plToggle}>
            ← {t("jobs.workspace.backToJobs")}
          </Link>
          <h1 className={jobStyles.jobCardTitle}>{job?.title}</h1>
          <p className={jobStyles.jobCardMeta}>
            {job?.clientName || job?.client_name} · {t("jobs.dailyReports.title")}
          </p>
        </div>
      </header>

      <JobWorkspaceNav jobId={jobId} active="daily-reports" />

      {error ? <div className={jobStyles.plError}>{error}</div> : null}
      {notice ? <div className={jobStyles.plPositive}>{notice}</div> : null}

      <section className={jobStyles.financialSection}>
        <h2>{t("jobs.dailyReports.addTitle")}</h2>
        <div className={jobStyles.expenseFormGrid}>
          <input
            type="date"
            value={form.reportDate}
            onChange={(e) => setForm({ ...form, reportDate: e.target.value })}
          />
          <input
            placeholder={t("jobs.dailyReports.crewMember")}
            value={form.crewName}
            onChange={(e) => setForm({ ...form, crewName: e.target.value })}
          />
          <input
            type="number"
            min="0"
            step="0.25"
            placeholder={t("jobs.dailyReports.hours")}
            value={form.crewHours}
            onChange={(e) => setForm({ ...form, crewHours: e.target.value })}
          />
          <input
            placeholder={t("jobs.dailyReports.materials")}
            value={form.materials}
            onChange={(e) => setForm({ ...form, materials: e.target.value })}
          />
          <input
            placeholder={t("jobs.dailyReports.equipment")}
            value={form.equipment}
            onChange={(e) => setForm({ ...form, equipment: e.target.value })}
          />
          <input
            placeholder={t("jobs.dailyReports.weather")}
            value={form.weather}
            onChange={(e) => setForm({ ...form, weather: e.target.value })}
          />
          <textarea
            placeholder={t("jobs.dailyReports.notes")}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            style={{ gridColumn: "1 / -1" }}
          />
        </div>
        <div className={jobStyles.financialActions} style={{ marginTop: 12 }}>
          <button type="button" className={jobStyles.btnFileLink} onClick={saveReport}>
            {t("jobs.dailyReports.save")}
          </button>
          <Link href={`/jobs/${jobId}/photos`} className={jobStyles.btnFileLink}>
            {t("jobs.dailyReports.openPhotos")}
          </Link>
        </div>
      </section>

      <section className={jobStyles.financialSection}>
        <h2>{t("jobs.dailyReports.historyTitle")}</h2>
        {reports.length === 0 ? (
          <p className={jobStyles.plMuted}>{t("jobs.dailyReports.empty")}</p>
        ) : (
          <ul className={jobStyles.plEntryList}>
            {reports.map((report) => (
              <li key={report.id}>
                <strong>{report.reportDate}</strong>
                {report.crew?.length
                  ? ` · ${report.crew.map((m) => `${m.name} ${m.hours}h`).join(", ")}`
                  : ""}
                {report.materials ? ` · ${report.materials}` : ""}
                {report.notes ? ` — ${report.notes}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
