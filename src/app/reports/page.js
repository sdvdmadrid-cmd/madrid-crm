"use client";

import Link from "next/link";
import styles from "@/app/dashboard/page.module.css";

const REPORT_LINKS = [
  {
    href: "/dashboard/financial",
    title: "Business P&L",
    description: "Monthly revenue, payroll, expenses, gross profit, AR, and job pipeline.",
    testId: "reports-business-pl",
  },
  {
    href: "/invoices/summary",
    title: "Revenue & invoices",
    description: "Invoice totals, paid vs open, and collection performance.",
    testId: "reports-invoice-summary",
  },
  {
    href: "/payroll/reports",
    title: "Payroll reports",
    description: "Labor cost, tax withholdings, and pay run history.",
    testId: "reports-payroll",
  },
  {
    href: "/jobs",
    title: "Job performance",
    description: "Open each job’s Financial dashboard for cost breakdown and profitability.",
    testId: "reports-jobs",
  },
  {
    href: "/equipment",
    title: "Equipment costs",
    description: "Equipment inventory, maintenance, and job assignment costs.",
    testId: "reports-equipment",
  },
];

export default function ReportsHubPage() {
  return (
    <main className={styles.page} data-testid="reports-hub">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Reports</p>
          <h1 className={styles.title}>Production reports</h1>
          <p className={styles.subtitle}>
            Revenue, profit, payroll, expenses, and job performance — all in FieldBase.
          </p>
        </div>
        <Link href="/dashboard" className={styles.secondaryAction}>
          ← Dashboard
        </Link>
      </header>

      <div className={styles.metricsGrid}>
        {REPORT_LINKS.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className={styles.metricCard}
            data-testid={report.testId}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <p className={styles.metricLabel}>{report.title}</p>
            <p className={styles.metricValue} style={{ fontSize: "1rem", fontWeight: 600 }}>
              View report →
            </p>
            <p className={styles.metricHint}>{report.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
