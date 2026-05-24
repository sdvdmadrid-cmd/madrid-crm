"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import ContractorTrustStrip from "@/components/workspace/ContractorTrustStrip";
import DeployBuildBadge from "@/components/workspace/DeployBuildBadge";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import styles from "./settings.module.css";

const SETTINGS_LINKS = [
  {
    href: "/settings/payments",
    titleKey: "settingsHub.clientPayments.title",
    descKey: "settingsHub.clientPayments.desc",
    ctaKey: "settingsHub.clientPayments.cta",
    accent: "emerald",
  },
  {
    href: "/subscriptions",
    titleKey: "settingsHub.subscription.title",
    descKey: "settingsHub.subscription.desc",
    ctaKey: "settingsHub.subscription.cta",
    accent: "blue",
  },
];

export default function SettingsHubPage() {
  const { t } = useTranslation();

  return (
    <PremiumPageShell
      title={t("settingsHub.title")}
      subtitle={t("settingsHub.subtitle")}
    >
      <ContractorTrustStrip />
      <div className={styles.grid}>
        {SETTINGS_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.card} ${styles[`card_${item.accent}`]}`}
          >
            <h2 className={styles.cardTitle}>{t(item.titleKey)}</h2>
            <p className={styles.cardDesc}>{t(item.descKey)}</p>
            <span className={styles.cardCta}>{t(item.ctaKey)} →</span>
          </Link>
        ))}
      </div>
      <DeployBuildBadge />
    </PremiumPageShell>
  );
}
