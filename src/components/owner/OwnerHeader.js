"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { getOwnerPageTitleKey } from "@/components/owner/owner-nav";
import OwnerLogoutButton from "@/components/owner/OwnerLogoutButton";
import styles from "./OwnerShell.module.css";

export default function OwnerHeader() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const titleKey = getOwnerPageTitleKey(pathname);

  return (
    <header className={styles.ownerHeader}>
      <div>
        <p className={styles.ownerHeaderEyebrow}>{t("ownerNav.commandCenter")}</p>
        <h1 className={styles.ownerHeaderTitle}>{t(titleKey)}</h1>
      </div>
      <div className={styles.ownerHeaderActions}>
        <OwnerLogoutButton variant="header" />
      </div>
    </header>
  );
}
