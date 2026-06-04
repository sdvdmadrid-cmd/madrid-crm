"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/invoices/invoices.module.css";
import "@/i18n";

function formatMoney(value, locale) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function SummaryCard({ label, value, hint, tone = "default" }) {
  const toneClass =
    tone === "paid"
      ? styles.summaryCardPaid
      : tone === "unpaid"
        ? styles.summaryCardUnpaid
        : tone === "total"
          ? styles.summaryCardTotal
          : styles.summaryCardDefault;

  return (
    <div className={`${styles.summaryCard} ${toneClass}`}>
      <div className={styles.summaryCardLabel}>{label}</div>
      <div className={styles.summaryCardValue}>{value}</div>
      {hint ? <div className={styles.summaryCardHint}>{hint}</div> : null}
    </div>
  );
}

export default function InvoiceRevenueSummaryClient({ scope = "tenant" }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const query = scope === "platform" ? "?scope=platform" : "";
      const res = await apiFetch(`/api/invoices/summary${query}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `Request failed (${res.status})`);
      }
      setData(payload.data);
    } catch (err) {
      setError(err?.message || "Unable to load summary");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;
  const counts = summary?.counts || {};
  const locale = i18n.language?.startsWith("es") ? "es-US" : "en-US";
  const isPlatform = scope === "platform";

  return (
    <div className={styles.page} data-testid="invoice-revenue-summary">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.headerTitle}>
            {isPlatform
              ? t("invoiceSummary.platformTitle", {
                  defaultValue: "Platform invoice revenue",
                })
              : t("invoiceSummary.title", { defaultValue: "Invoice totals" })}
          </h1>
          <p className={styles.headerSub}>
            {isPlatform
              ? t("invoiceSummary.platformSubtitle", {
                  defaultValue:
                    "Total collected and outstanding balances across all contractor invoices.",
                })
              : t("invoiceSummary.subtitle", {
                  defaultValue:
                    "See how much you have collected and what is still unpaid on your invoices.",
                })}
          </p>
        </div>
        <div className={styles.headerActions}>
          {!isPlatform ? (
            <Link href="/invoices" className={styles.btnGhost}>
              {t("invoiceSummary.backToInvoices", {
                defaultValue: "Back to invoices",
              })}
            </Link>
          ) : (
            <Link href="/owner/overview" className={styles.btnGhost}>
              {t("invoiceSummary.backToOwner", {
                defaultValue: "Back to Mission Control",
              })}
            </Link>
          )}
        </div>
      </header>

      {loading ? (
        <p className={styles.loading}>{t("invoices.loading")}</p>
      ) : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {summary ? (
        <>
          <div className={styles.summaryGrid}>
            <SummaryCard
              tone="paid"
              label={t("invoiceSummary.totalPaid", { defaultValue: "Total paid" })}
              value={formatMoney(summary.totalPaid, locale)}
              hint={t("invoiceSummary.paidHint", {
                count: counts.paidCount || 0,
                defaultValue: "{{count}} paid invoices",
              })}
            />
            <SummaryCard
              tone="unpaid"
              label={t("invoiceSummary.totalUnpaid", {
                defaultValue: "Total unpaid",
              })}
              value={formatMoney(summary.totalUnpaid, locale)}
              hint={t("invoiceSummary.unpaidHint", {
                count: counts.unpaidCount || 0,
                defaultValue: "{{count}} open invoices",
              })}
            />
            <SummaryCard
              tone="total"
              label={t("invoiceSummary.totalInvoiced", {
                defaultValue: "Total invoiced",
              })}
              value={formatMoney(summary.totalInvoiced, locale)}
              hint={t("invoiceSummary.invoicedHint", {
                count: counts.invoiceCount || 0,
                defaultValue: "{{count}} invoices total",
              })}
            />
          </div>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              {t("invoiceSummary.breakdownTitle", { defaultValue: "Breakdown" })}
            </h2>
            <dl className={styles.summaryBreakdown}>
              <div>
                <dt>{t("invoiceSummary.partial", { defaultValue: "Partial payments" })}</dt>
                <dd>{counts.partialCount || 0}</dd>
              </div>
              <div>
                <dt>{t("invoiceSummary.overdue", { defaultValue: "Overdue" })}</dt>
                <dd>{counts.overdueCount || 0}</dd>
              </div>
              <div>
                <dt>{t("invoiceSummary.drafts", { defaultValue: "Drafts" })}</dt>
                <dd>{counts.draftCount || 0}</dd>
              </div>
            </dl>
            {!isPlatform ? (
              <p className={styles.muted}>
                {t("invoiceSummary.draftNote", {
                  defaultValue:
                    "Draft invoices are not included in unpaid totals until you save and send them.",
                })}
              </p>
            ) : null}
          </section>

          {isPlatform && Array.isArray(data.byTenant) && data.byTenant.length > 0 ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>
                {t("invoiceSummary.byTenantTitle", {
                  defaultValue: "By tenant",
                })}
              </h2>
              <div className={styles.summaryTableWrap}>
                <table className={styles.summaryTable}>
                  <thead>
                    <tr>
                      <th>{t("invoiceSummary.tenant", { defaultValue: "Tenant" })}</th>
                      <th>{t("invoiceSummary.totalPaid", { defaultValue: "Paid" })}</th>
                      <th>{t("invoiceSummary.totalUnpaid", { defaultValue: "Unpaid" })}</th>
                      <th>{t("invoiceSummary.totalInvoiced", { defaultValue: "Invoiced" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byTenant.map((row) => (
                      <tr key={row.tenantId}>
                        <td>{row.tenantId}</td>
                        <td>{formatMoney(row.totalPaid, locale)}</td>
                        <td>{formatMoney(row.totalUnpaid, locale)}</td>
                        <td>{formatMoney(row.totalInvoiced, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
