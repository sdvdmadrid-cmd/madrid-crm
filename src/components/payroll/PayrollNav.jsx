"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import styles from "@/app/payroll/payroll.module.css";

const LINKS = [
  { href: "/payroll", labelKey: "payroll.nav.overview", exact: true },
  { href: "/payroll/employees", labelKey: "payroll.nav.employees" },
  { href: "/payroll/runs", labelKey: "payroll.nav.runs" },
  { href: "/payroll/time", labelKey: "payroll.nav.time" },
  { href: "/payroll/calendar", labelKey: "payroll.nav.calendar" },
  { href: "/payroll/reports", labelKey: "payroll.nav.reports" },
];

export default function PayrollNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav className={styles.navRow} aria-label={t("payroll.nav.aria")}>
      {LINKS.map((link) => {
        const active =
          link.exact
            ? pathname === link.href
            : pathname === link.href || pathname?.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? styles.navLinkActive : styles.navLink}
          >
            {t(link.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
