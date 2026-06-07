"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCachedApiFetch } from "@/hooks/useCachedApiFetch";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import GettingStartedChecklist from "@/components/workspace/GettingStartedChecklist";
import PaymentsReadinessBanner from "@/components/workspace/PaymentsReadinessBanner";
import { FIELDBASE_PILLARS } from "@/lib/fieldbase-pillars";
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
  const { authUser } = useCurrentUserAccess();
  const userName = String(authUser?.name || "").trim();
  const sessionReady = Boolean(authUser?.userId);
  const cacheScope = authUser?.userId || "anon";

  const {
    data: metricsPayload,
    loading: metricsLoading,
    error: metricsFetchError,
  } = useCachedApiFetch(`dashboard:metrics:${cacheScope}`, "/api/dashboard-metrics", {
    ttlMs: 120_000,
    enabled: sessionReady,
  });

  const {
    data: revenuePayload,
    loading: revenueLoading,
  } = useCachedApiFetch(
    `dashboard:revenue:10:${cacheScope}`,
    "/api/revenue-dashboard?limit=10",
    { ttlMs: 120_000, enabled: sessionReady },
  );

  const {
    data: connectPayload,
    loading: connectLoading,
  } = useCachedApiFetch(
    `dashboard:connect:${cacheScope}`,
    "/api/payments/connect/status",
    { ttlMs: 90_000,
      enabled: sessionReady,
    },
  );

  useEffect(() => {
    if (String(authUser?.role || "").toLowerCase() === "super_admin") {
      router.replace("/owner/overview");
    }
  }, [authUser?.role, router]);

  const loading = sessionReady && (metricsLoading || revenueLoading || connectLoading) && !metricsPayload;
  const metrics = metricsPayload || null;
  const metricsError = metricsFetchError
    ? "Unable to load dashboard metrics."
    : metricsPayload ? "" : metricsLoading ? "" : "Dashboard metrics unavailable.";
  const revenueData = useMemo(
    () => ({
      totalRevenue: Number(revenuePayload?.totalRevenue || 0),
      totalPayments: Number(revenuePayload?.totalPayments || 0),
      recentPayments: Array.isArray(revenuePayload?.recentPayments)
        ? revenuePayload.recentPayments
        : [],
    }),
    [revenuePayload],
  );
  const revenueUnavailable = sessionReady && !revenueLoading && !revenuePayload;
  const connectStatus = connectPayload?.data || null;
  const paymentsOnboarded = Boolean(connectStatus?.onboarded);

  const activeJobs = metrics?.jobs?.active ?? 0;
  const pendingEstimates = metrics?.estimateRequests?.newCount ?? 0;
  const newWebsiteLeads = metrics?.leadInbox?.newCount ?? 0;
  const inboxAttention = pendingEstimates + newWebsiteLeads;
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

  const clientCount = Number(metrics?.clients?.total || 0);
  const invoiceCount = Number(metrics?.invoices?.total || 0);

  const gettingStartedSteps = [
    {
      id: "payments",
      done: paymentsOnboarded,
      href: "/settings/payments",
      labelKey: "gettingStarted.steps.payments.label",
      descKey: "gettingStarted.steps.payments.desc",
    },
    {
      id: "client",
      done: clientCount > 0,
      href: "/clients",
      labelKey: "gettingStarted.steps.client.label",
      descKey: "gettingStarted.steps.client.desc",
    },
    {
      id: "invoice",
      done: invoiceCount > 0,
      href: "/invoices",
      labelKey: "gettingStarted.steps.invoice.label",
      descKey: "gettingStarted.steps.invoice.desc",
    },
  ];

  return (
    <main className={styles.page} data-testid="dashboard-shell">
      <header className={styles.topBar}>
        <div>
          <p className={styles.eyebrow}>{t("dashboardControl.operationsLabel")}</p>
          <h1 className={styles.title}>{t("dashboardControl.title")}</h1>
          <p className={styles.subtitle}>
            {userName
              ? t("dashboardControl.subtitleWithName", { name: userName })
              : t("dashboardControl.subtitle")}
          </p>
          <p className={styles.workflowGuide}>{t("dashboardControl.workflowGuide")}</p>
        </div>
        <div className={styles.quickActions}>
          <Link href="/estimates/new" className={styles.primaryAction}>
            <PlusIcon />
            {t("dashboardControl.actions.newEstimate")}
          </Link>
          <Link href="/clients?action=new" className={styles.coPrimaryAction}>
            {t("dashboardControl.actions.addClient")}
          </Link>
          <Link href="/dashboard/financial" className={styles.secondaryAction}>
            Business P&L
          </Link>
          <Link
            href="/settings/payments"
            className={styles.secondaryAction}
            data-testid="dashboard-collect-payment"
          >
            {t("dashboardControl.actions.collectPayment")}
          </Link>
          <details className={styles.moreActions}>
            <summary
              role="button"
              aria-haspopup="menu"
              data-testid="dashboard-more-actions"
            >
              {inboxAttention > 0
                ? t("dashboardControl.actions.moreActionsWithCount", {
                    count: inboxAttention,
                  })
                : t("dashboardControl.actions.moreActions")}
            </summary>
            <div className={styles.moreActionsMenu} role="menu">
              <Link
                href="/settings/payments"
                className={styles.moreActionsItem}
                role="menuitem"
              >
                {t("dashboardControl.actions.collectPayment")}
              </Link>
              <Link
                href="/jobs?action=new"
                className={styles.moreActionsItem}
                role="menuitem"
                title={t("dashboardControl.actions.createJobManuallyHint")}
              >
                {t("dashboardControl.actions.createJobManually")}
              </Link>
              {inboxAttention > 0 ? (
                <Link
                  href="/lead-inbox"
                  className={styles.moreActionsItem}
                  role="menuitem"
                  data-testid="dashboard-lead-inbox-cta"
                >
                  {t("dashboardControl.actions.openLeadInbox", {
                    count: inboxAttention,
                    defaultValue: `Lead inbox (${inboxAttention})`,
                  })}
                </Link>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      <PaymentsReadinessBanner connectStatus={connectStatus} skipFetch />
      <GettingStartedChecklist steps={gettingStartedSteps} />

      <section className={styles.pillarsGrid} aria-label={t("dashboardControl.pillars.ariaLabel")}>
        {FIELDBASE_PILLARS.map((pillar) => (
          <article key={pillar.id} className={styles.pillarCard}>
            <div
              className={styles.pillarAccent}
              style={{ background: pillar.accent }}
            />
            <p className={styles.pillarTag}>{t(pillar.taglineKey)}</p>
            <h2 className={styles.pillarTitle}>{t(pillar.titleKey)}</h2>
            <p className={styles.pillarDesc}>{t(pillar.descKey)}</p>
            <div className={styles.pillarLinks}>
              {pillar.links.map((link) => (
                <Link key={link.href} href={link.href} className={styles.pillarLink}>
                  {t(link.labelKey)}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <div className={styles.grid12}>
        <section className={`${styles.panel} ${styles.span12}`}>
          {loading ? (
            <div className={styles.metricSkeletonGrid}>
              <div className={`fb-shimmer ${styles.skeletonCard} ${styles.skeletonLarge}`} />
              <div className={`fb-shimmer ${styles.skeletonCard}`} />
              <div className={`fb-shimmer ${styles.skeletonCard}`} />
            </div>
          ) : (
            <>
              {metricsError ? (
                <p className={styles.workflowGuide} role="alert" data-testid="dashboard-metrics-error">
                  {metricsError}
                </p>
              ) : null}
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

              <Link href="/jobs" className={`${styles.metricHero} ${styles.metricLink}`} data-testid="dashboard-metric-active-jobs" data-disable-instant-nav="true">
                <div className={styles.metricHead}>
                  <BriefcaseIcon />
                  <p className={styles.metricLabel}>{t("dashboardControl.metrics.activeJobs")}</p>
                </div>
                <p className={styles.metricValue}>{formatNumber(activeJobs)}</p>
                <p className={styles.metricHint}>{t("dashboardControl.metrics.activeJobsHint")}</p>
              </Link>

              <Link
                href="/lead-inbox"
                className={`${styles.metricHero} ${styles.metricLink}`}
                data-testid="dashboard-metric-inbox"
                data-disable-instant-nav="true"
              >
                <div className={styles.metricHead}>
                  <ClockIcon />
                  <p className={styles.metricLabel}>{t("dashboardControl.metrics.pendingEstimates")}</p>
                </div>
                <p className={styles.metricValue}>{formatNumber(inboxAttention)}</p>
                <p className={styles.metricHint}>
                  {newWebsiteLeads > 0
                    ? t("dashboardControl.metrics.inboxHintWithLeads", {
                        leads: formatNumber(newWebsiteLeads),
                        requests: formatNumber(pendingEstimates),
                        defaultValue: `${formatNumber(newWebsiteLeads)} website · ${formatNumber(pendingEstimates)} requests`,
                      })
                    : t("dashboardControl.metrics.pendingEstimatesHint")}
                </p>
              </Link>
            </div>
            </>
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
            <Link href="/invoices" className={styles.healthRow}>
              <span className={`${styles.statusPill} ${styles.status_pending}`}>{t("dashboardControl.statuses.pending")}</span>
              <strong>{formatNumber(unpaidInvoices)}</strong>
            </Link>
            <Link href="/invoices" className={styles.healthRow}>
              <span className={`${styles.statusPill} ${styles.status_overdue}`}>{t("dashboardControl.statuses.overdue")}</span>
              <strong>{formatNumber(overdueInvoices)}</strong>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}