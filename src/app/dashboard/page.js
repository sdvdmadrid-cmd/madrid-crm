"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import styles from "./page.module.css";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const FALLBACK_CHART = [36, 48, 42, 56, 52, 65, 61, 74, 68, 72];

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatDate(value, fallbackLabel) {
  if (!value) return fallbackLabel;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallbackLabel;
  return dateFormatter.format(parsed);
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={styles.cardIcon} aria-hidden="true">
      <path d="M10 2l1.8 3.8L16 7.5l-3.8 1.8L10 13l-1.8-3.7L4.5 7.5l3.7-1.7L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={styles.cardIcon} aria-hidden="true">
      <rect x="2.4" y="5.3" width="15.2" height="10.8" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 5V3.8a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0113 3.8V5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={styles.cardIcon} aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.4V10l2.6 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={styles.actionIcon} aria-hidden="true">
      <path d="M10 4.2v11.6M4.2 10h11.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function RevenueDashboardPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [revenueData, setRevenueData] = useState({
    totalRevenue: 0,
    totalPayments: 0,
    recentPayments: [],
  });
  const [revenueUnavailable, setRevenueUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12_000);

      let requests;
      try {
        requests = await Promise.allSettled([
          apiFetch("/api/auth/me", { signal: controller.signal, suppressUnauthorizedEvent: true }),
          apiFetch("/api/dashboard-metrics", { signal: controller.signal, suppressUnauthorizedEvent: true }),
          apiFetch("/api/revenue-dashboard?limit=10", { signal: controller.signal, suppressUnauthorizedEvent: true }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }

      if (cancelled) return;

      const [sessionResult, metricsResult, revenueResult] = requests;

      if (sessionResult.status === "fulfilled" && sessionResult.value.ok) {
        const sessionPayload = await sessionResult.value.json().catch(() => null);
        const sessionRole = String(sessionPayload?.data?.role || "").toLowerCase();
        if (sessionRole === "super_admin") {
          router.replace("/admin");
          return;
        }
        setUserName(String(sessionPayload?.data?.name || "").trim());
      }

      if (metricsResult.status === "fulfilled" && metricsResult.value.ok) {
        const payload = await metricsResult.value.json().catch(() => null);
        setMetrics(payload || null);
      } else {
        setMetrics(null);
      }

      if (revenueResult.status === "fulfilled" && revenueResult.value.ok) {
        const payload = await revenueResult.value.json().catch(() => null);
        setRevenueData({
          totalRevenue: Number(payload?.totalRevenue || 0),
          totalPayments: Number(payload?.totalPayments || 0),
          recentPayments: Array.isArray(payload?.recentPayments)
            ? payload.recentPayments
            : [],
        });
        setRevenueUnavailable(false);
      } else {
        setRevenueUnavailable(true);
        setRevenueData({ totalRevenue: 0, totalPayments: 0, recentPayments: [] });
      }

      setLoading(false);
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const activeJobs = metrics?.jobs?.active ?? 0;
  const pendingEstimates = metrics?.estimateRequests?.newCount ?? 0;
  const outstandingAmount = metrics?.invoices?.outstanding ?? 0;
  const unpaidInvoices = metrics?.invoices?.unpaidCount ?? 0;
  const paidInvoices = Math.max(
    0,
    Number(metrics?.invoices?.total || 0) - Number(metrics?.invoices?.unpaidCount || 0),
  );
  const overdueInvoices = metrics?.invoices?.overdueCount ?? 0;

  const chartValues = (() => {
    const values = (revenueData.recentPayments || [])
      .map((item) => Number(item.totalRevenue || item.amount || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length >= 4) return values.slice(-10);
    return FALLBACK_CHART;
  })();

  const chartMax = Math.max(...chartValues, 1);

  const workspaceCards = [
    {
      title: t("dashboardControl.workspace.clientsTitle"),
      desc: t("dashboardControl.workspace.clientsDesc"),
      href: "/clients",
      action: t("dashboardControl.workspace.clientsAction"),
    },
    {
      title: t("dashboardControl.workspace.estimatesTitle"),
      desc: t("dashboardControl.workspace.estimatesDesc"),
      href: "/estimates",
      action: t("dashboardControl.workspace.estimatesAction"),
    },
    {
      title: t("dashboardControl.workspace.jobsTitle"),
      desc: t("dashboardControl.workspace.jobsDesc"),
      href: "/jobs",
      action: t("dashboardControl.workspace.jobsAction"),
    },
    {
      title: t("dashboardControl.workspace.invoicesTitle"),
      desc: t("dashboardControl.workspace.invoicesDesc"),
      href: "/invoices",
      action: t("dashboardControl.workspace.invoicesAction"),
    },
  ];

  const activityItems = revenueData.recentPayments.slice(0, 6).map((item, index) => ({
    id: `${item.day || item.created_at || index}`,
    title: t("dashboardControl.activity.paymentRecorded", {
      amount: formatCurrency(item.totalRevenue || item.amount || 0),
    }),
    time: formatDate(item.day || item.created_at, t("dashboardControl.activity.unknownDate")),
    status: "paid",
  }));

  if (activityItems.length === 0) {
    activityItems.push(
      {
        id: "a1",
        title: t("dashboardControl.activity.estimateAwaitingApproval"),
        time: t("dashboardControl.activity.today"),
        status: "pending",
      },
      {
        id: "a2",
        title: t("dashboardControl.activity.invoiceReminderScheduled"),
        time: t("dashboardControl.activity.today"),
        status: "pending",
      },
      {
        id: "a3",
        title: t("dashboardControl.activity.paymentReceivedCompletedJob"),
        time: t("dashboardControl.activity.yesterday"),
        status: "paid",
      },
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div>
          <p className={styles.eyebrow}>{t("dashboardControl.operationsLabel")}</p>
          <h1 className={styles.title}>{t("dashboardControl.title")}</h1>
          <p className={styles.subtitle}>
            {userName
              ? t("dashboardControl.subtitleWithName", { name: userName })
              : t("dashboardControl.subtitle")}
          </p>
        </div>
        <div className={styles.quickActions}>
          <Link href="/estimates/new" className={styles.primaryAction}>
            <PlusIcon />
            {t("dashboardControl.actions.newEstimate")}
          </Link>
          <Link href="/jobs" className={styles.secondaryAction}>{t("dashboardControl.actions.newJob")}</Link>
          <Link href="/clients" className={styles.secondaryAction}>{t("dashboardControl.actions.addClient")}</Link>
        </div>
      </header>

      <div className={styles.grid12}>
        <section className={`${styles.panel} ${styles.span12}`}>
          {loading ? (
            <div className={styles.metricSkeletonGrid}>
              <div className={`${styles.skeletonCard} ${styles.skeletonLarge}`} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          ) : (
            <div className={styles.metricTopGrid}>
              <article className={`${styles.metricHero} ${styles.metricRevenue}`}>
                <div className={styles.metricHead}>
                  <SparkIcon />
                  <p className={styles.metricLabel}>{t("dashboardControl.metrics.revenue")}</p>
                </div>
                <p className={styles.metricHeroValue}>
                  {revenueUnavailable
                    ? formatCurrency(metrics?.jobs?.totalRevenue || 0)
                    : formatCurrency(revenueData.totalRevenue || metrics?.jobs?.totalRevenue || 0)}
                </p>
                <p className={styles.metricHint}>{t("dashboardControl.metrics.revenueHint")}</p>
              </article>

              <article className={styles.metricHero}>
                <div className={styles.metricHead}>
                  <BriefcaseIcon />
                  <p className={styles.metricLabel}>{t("dashboardControl.metrics.activeJobs")}</p>
                </div>
                <p className={styles.metricValue}>{formatNumber(activeJobs)}</p>
                <p className={styles.metricHint}>{t("dashboardControl.metrics.activeJobsHint")}</p>
              </article>

              <article className={styles.metricHero}>
                <div className={styles.metricHead}>
                  <ClockIcon />
                  <p className={styles.metricLabel}>{t("dashboardControl.metrics.pendingEstimates")}</p>
                </div>
                <p className={styles.metricValue}>{formatNumber(pendingEstimates)}</p>
                <p className={styles.metricHint}>{t("dashboardControl.metrics.pendingEstimatesHint")}</p>
              </article>
            </div>
          )}
        </section>

        <section className={`${styles.panel} ${styles.span8}`}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionLabel}>{t("dashboardControl.sections.performance")}</p>
              <h2 className={styles.sectionTitle}>{t("dashboardControl.sections.revenueTrend")}</h2>
            </div>
            <span className={styles.softBadge}>{t("dashboardControl.sections.lastPeriods")}</span>
          </div>
          <div className={styles.chartWrap}>
            {chartValues.map((value, index) => (
              <div key={`${value}-${index}`} className={styles.chartBarCol}>
                <div
                  className={styles.chartBar}
                  style={{ height: `${Math.max(16, (value / chartMax) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className={styles.chartLegend}>
            <span>{t("dashboardControl.chart.outstanding")} {formatCurrency(outstandingAmount)}</span>
            <span>{t("dashboardControl.chart.unpaidInvoices")} {formatNumber(unpaidInvoices)}</span>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.span4}`}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionLabel}>{t("dashboardControl.sections.updates")}</p>
              <h2 className={styles.sectionTitle}>{t("dashboardControl.sections.recentActivity")}</h2>
            </div>
          </div>
          <div className={styles.activityList}>
            {activityItems.map((item) => (
              <article key={item.id} className={styles.activityRow}>
                <span className={`${styles.statusDot} ${styles[`status_${item.status}`]}`} />
                <div className={styles.activityTextWrap}>
                  <p className={styles.activityTitle}>{item.title}</p>
                  <p className={styles.activityMeta}>{item.time}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.span7}`}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionLabel}>{t("dashboardControl.sections.workspace")}</p>
              <h2 className={styles.sectionTitle}>{t("dashboardControl.sections.coreModules")}</h2>
            </div>
          </div>
          <div className={styles.moduleGrid}>
            {workspaceCards.map((card) => (
              <Link key={card.title} href={card.href} className={styles.moduleCard}>
                <div className={styles.moduleIcon}><SparkIcon /></div>
                <h3 className={styles.moduleTitle}>{card.title}</h3>
                <p className={styles.moduleDesc}>{card.desc}</p>
                <span className={styles.moduleAction}>{card.action}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.span5}`}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionLabel}>{t("dashboardControl.sections.financeStatus")}</p>
              <h2 className={styles.sectionTitle}>{t("dashboardControl.sections.collectionsHealth")}</h2>
            </div>
          </div>
          <div className={styles.healthStack}>
            <div className={styles.healthRow}>
              <span className={`${styles.statusPill} ${styles.status_paid}`}>{t("dashboardControl.statuses.paid")}</span>
              <strong>{formatNumber(paidInvoices)}</strong>
            </div>
            <div className={styles.healthRow}>
              <span className={`${styles.statusPill} ${styles.status_pending}`}>{t("dashboardControl.statuses.pending")}</span>
              <strong>{formatNumber(unpaidInvoices)}</strong>
            </div>
            <div className={styles.healthRow}>
              <span className={`${styles.statusPill} ${styles.status_overdue}`}>{t("dashboardControl.statuses.overdue")}</span>
              <strong>{formatNumber(overdueInvoices)}</strong>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}