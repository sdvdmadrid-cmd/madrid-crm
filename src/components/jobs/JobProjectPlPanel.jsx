"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import jobStyles from "@/app/jobs/jobs.module.css";

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function JobProjectPlPanel({ jobId, defaultOpen = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/jobs/${jobId}/pl-summary`);
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load project P&L");
      }
      setPl(payload.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (open && !pl && !loading) load();
  }, [open, pl, loading, load]);

  if (!jobId) return null;

  const breakdown = pl?.breakdown || {};

  return (
    <div className={jobStyles.plPanel} data-testid={`job-pl-panel-${jobId}`}>
      <button
        type="button"
        className={jobStyles.plToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} {t("jobs.pl.title", { defaultValue: "Project P&L" })}
        {pl?.metrics?.isLosingMoney ? (
          <span className={jobStyles.plNegative}> · Losing money</span>
        ) : null}
      </button>

      {open ? (
        <div className={jobStyles.plBody}>
          {loading ? <p className={jobStyles.plMuted}>{t("common.loading", { defaultValue: "Loading…" })}</p> : null}
          {error ? <p className={jobStyles.plError}>{error}</p> : null}
          {pl ? (
            <>
              <div className={jobStyles.plGrid}>
                <div className={jobStyles.plStat}>
                  <span className={jobStyles.plLabel}>Revenue</span>
                  <strong>{money(pl.revenue)}</strong>
                </div>
                <div className={jobStyles.plStat}>
                  <span className={jobStyles.plLabel}>Total cost</span>
                  <strong>{money(pl.actual.totalCost)}</strong>
                </div>
                <div className={jobStyles.plStat}>
                  <span className={jobStyles.plLabel}>Gross profit</span>
                  <strong
                    className={
                      pl.profit.grossProfit >= 0
                        ? jobStyles.plPositive
                        : jobStyles.plNegative
                    }
                  >
                    {money(pl.profit.grossProfit)} ({pl.profit.marginPercent}%)
                  </strong>
                </div>
              </div>

              <ul className={jobStyles.plBreakdownList}>
                <li>Labor: {money(breakdown.labor)}</li>
                <li>Materials: {money(breakdown.materials)}</li>
                <li>Equipment: {money(breakdown.equipment)}</li>
                <li>Subcontractors: {money(breakdown.subcontractor)}</li>
              </ul>

              <div className={jobStyles.financialActions}>
                <Link href={`/jobs/${jobId}/financial`} className={jobStyles.btnFileLink}>
                  Open financial dashboard
                </Link>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
