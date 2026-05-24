"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { OWNER_NAV_GROUPS } from "@/components/owner/owner-nav";
import OwnerLogoutButton from "@/components/owner/OwnerLogoutButton";
import styles from "./OwnerShell.module.css";

export default function OwnerSidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <aside className={styles.ownerSidebar}>
      <div className={styles.ownerBrand}>
        <span className={styles.ownerBrandMark}>FB</span>
        <div>
          <div className={styles.ownerBrandTitle}>{t("ownerNav.commandCenter")}</div>
          <div className={styles.ownerBrandSub}>{t("ownerNav.platform")}</div>
        </div>
      </div>

      <nav className={styles.ownerNav}>
        {OWNER_NAV_GROUPS.map((group) => (
          <div key={group.id} className={styles.ownerNavGroup}>
            <div className={styles.ownerNavGroupLabel}>{t(group.labelKey)}</div>
            <ul>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/owner/overview" &&
                    pathname?.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={isActive ? styles.ownerNavLinkActive : styles.ownerNavLink}
                    >
                      <span className={styles.ownerNavIcon} aria-hidden>
                        {item.icon}
                      </span>
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={styles.ownerSidebarFooter}>
        <OwnerLogoutButton variant="sidebar" />
      </div>
    </aside>
  );
}
