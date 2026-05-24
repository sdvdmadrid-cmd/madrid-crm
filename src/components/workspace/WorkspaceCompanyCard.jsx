"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useTenantWorkspace } from "@/context/TenantWorkspaceContext";
import styles from "./WorkspaceCompanyCard.module.css";

/** Contractor company identity — workspace shell only, never platform brand. */
export default function WorkspaceCompanyCard({ compact = false }) {
  const { t } = useTranslation();
  const { isContractorMode, tenantCompanyName, loading } = useTenantWorkspace();

  if (loading || !isContractorMode || !tenantCompanyName) {
    return null;
  }

  return (
    <div
      className={`${styles.card} ${compact ? styles.cardCompact : ""}`}
      aria-label={t("workspace.companyCardAria", { company: tenantCompanyName })}
    >
      <p className={styles.kicker}>{t("workspace.yourCompany")}</p>
      <p className={styles.name}>{tenantCompanyName}</p>
      {!compact ? (
        <Link href="/website" className={styles.link}>
          {t("workspace.publicSite")} →
        </Link>
      ) : null}
    </div>
  );
}
