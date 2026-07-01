"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  getBackFallbackPath,
  getCrmBreadcrumbs,
  shouldShowCrmNav,
} from "@/lib/crm-navigation";

export default function CrmNavBar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  if (!shouldShowCrmNav(pathname)) {
    return null;
  }

  const crumbs = getCrmBreadcrumbs(pathname);
  const backHref = getBackFallbackPath(pathname);
  return (
    <nav
      className="crm-nav-bar crm-nav-premium"
      aria-label={t("nav.ariaLabel")}
    >
      <Link href={backHref} className="crm-nav-back">
        ← {t("nav.back")}
      </Link>

      {crumbs.length > 0 ? (
        <ol className="crm-nav-trail">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            const label =
              crumb.labelKey === "nav.currentPage"
                ? t("nav.currentPage")
                : t(crumb.labelKey);

            return (
              <li key={`${crumb.href}-${index}`}>
                {index > 0 ? (
                  <span aria-hidden="true" className="crm-nav-sep">
                    /
                  </span>
                ) : null}
                {isLast ? <strong>{label}</strong> : <Link href={crumb.href}>{label}</Link>}
              </li>
            );
          })}
        </ol>
      ) : null}
    </nav>
  );
}
