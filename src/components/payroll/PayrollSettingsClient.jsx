"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PayrollNav from "@/components/payroll/PayrollNav";
import { US_STATE_OPTIONS } from "@/lib/estimate-pricing";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const initialSettings = {
  employerLegalName: "",
  defaultPaySchedule: "biweekly",
  standardWeeklyHours: "40",
  payWeekStartDay: "1",
  defaultWorkState: "TX",
  autoSplitOvertime: true,
};

function FormField({ id, label, hint, children }) {
  return (
    <div className={styles.formField}>
      <label className={styles.formLabel} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className={styles.helperText}>{hint}</p> : null}
    </div>
  );
}

export default function PayrollSettingsClient() {
  const { t } = useTranslation();
  const [form, setForm] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/payroll/settings");
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load payroll settings");
      }
      const data = payload.data || {};
      setForm({
        employerLegalName: data.employerLegalName || "",
        defaultPaySchedule: data.defaultPaySchedule || "biweekly",
        standardWeeklyHours: String(data.standardWeeklyHours ?? 40),
        payWeekStartDay: String(data.payWeekStartDay ?? 1),
        defaultWorkState: data.defaultWorkState || "TX",
        autoSplitOvertime: data.autoSplitOvertime !== false,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/payroll/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerLegalName: form.employerLegalName,
          defaultPaySchedule: form.defaultPaySchedule,
          standardWeeklyHours: Number(form.standardWeeklyHours || 40),
          payWeekStartDay: Number(form.payWeekStartDay ?? 1),
          defaultWorkState: form.defaultWorkState,
          autoSplitOvertime: form.autoSplitOvertime,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "Unable to save payroll settings");
      }
      setNotice(t("payroll.settings.saved"));
      await loadSettings();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page} data-testid="payroll-settings-page">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("payroll.settings.title")}</h1>
          <p className={styles.subtitle}>{t("payroll.settings.subtitle")}</p>
        </div>
      </header>

      <PayrollNav />

      <div className={styles.infoBanner} data-testid="payroll-settings-scope-note">
        <strong>{t("payroll.settings.scopeTitle")}</strong>
        <p>{t("payroll.settings.scopeBody")}</p>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

      <section className={styles.card}>
        {loading ? (
          <p className={styles.muted}>{t("payroll.loading")}</p>
        ) : (
          <>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>
                {t("payroll.settings.sections.business")}
              </h2>
              <div className={styles.formGrid}>
                <FormField
                  id="payroll-employer-name"
                  label={t("payroll.settings.fields.employerLegalName")}
                  hint={t("payroll.settings.hints.employerLegalName")}
                >
                  <input
                    id="payroll-employer-name"
                    className={styles.field}
                    value={form.employerLegalName}
                    onChange={(e) =>
                      setForm({ ...form, employerLegalName: e.target.value })
                    }
                    placeholder={t("payroll.settings.placeholders.employerLegalName")}
                  />
                </FormField>
                <FormField
                  id="payroll-default-work-state"
                  label={t("payroll.settings.fields.defaultWorkState")}
                  hint={t("payroll.settings.hints.defaultWorkState")}
                >
                  <select
                    id="payroll-default-work-state"
                    className={styles.fieldSelect}
                    value={form.defaultWorkState}
                    onChange={(e) =>
                      setForm({ ...form, defaultWorkState: e.target.value })
                    }
                  >
                    {US_STATE_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.code} — {opt.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            </div>

            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>
                {t("payroll.settings.sections.schedule")}
              </h2>
              <div className={styles.formGrid}>
                <FormField
                  id="payroll-default-schedule"
                  label={t("payroll.settings.fields.defaultPaySchedule")}
                  hint={t("payroll.settings.hints.defaultPaySchedule")}
                >
                  <select
                    id="payroll-default-schedule"
                    className={styles.fieldSelect}
                    value={form.defaultPaySchedule}
                    onChange={(e) =>
                      setForm({ ...form, defaultPaySchedule: e.target.value })
                    }
                  >
                    <option value="weekly">{t("payroll.settings.schedules.weekly")}</option>
                    <option value="biweekly">
                      {t("payroll.settings.schedules.biweekly")}
                    </option>
                    <option value="semimonthly">
                      {t("payroll.settings.schedules.semimonthly")}
                    </option>
                    <option value="monthly">{t("payroll.settings.schedules.monthly")}</option>
                  </select>
                </FormField>
                <FormField
                  id="payroll-standard-weekly-hours"
                  label={t("payroll.settings.fields.standardWeeklyHours")}
                  hint={t("payroll.settings.hints.standardWeeklyHours")}
                >
                  <input
                    id="payroll-standard-weekly-hours"
                    className={styles.field}
                    type="number"
                    min="1"
                    max="168"
                    step="0.25"
                    value={form.standardWeeklyHours}
                    onChange={(e) =>
                      setForm({ ...form, standardWeeklyHours: e.target.value })
                    }
                  />
                </FormField>
                <FormField
                  id="payroll-week-start-day"
                  label={t("payroll.settings.fields.payWeekStartDay")}
                  hint={t("payroll.settings.hints.payWeekStartDay")}
                >
                  <select
                    id="payroll-week-start-day"
                    className={styles.fieldSelect}
                    value={form.payWeekStartDay}
                    onChange={(e) =>
                      setForm({ ...form, payWeekStartDay: e.target.value })
                    }
                  >
                    {WEEKDAY_KEYS.map((key, index) => (
                      <option key={key} value={String(index)}>
                        {t(`payroll.settings.weekdays.${key}`)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className={styles.formField}>
                  <label className={styles.toggleRow}>
                    <input
                      id="payroll-auto-split-overtime"
                      type="checkbox"
                      checked={form.autoSplitOvertime}
                      onChange={(e) =>
                        setForm({ ...form, autoSplitOvertime: e.target.checked })
                      }
                      data-testid="payroll-auto-split-overtime"
                    />
                    <span>{t("payroll.settings.fields.autoSplitOvertime")}</span>
                  </label>
                  <p className={styles.helperText}>
                    {t("payroll.settings.hints.autoSplitOvertime")}
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                data-testid="payroll-settings-save"
                disabled={saving}
                onClick={saveSettings}
              >
                {saving ? t("payroll.actions.working") : t("payroll.settings.save")}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
