"use client";

import { useTranslation } from "react-i18next";
import styles from "./ContractorTrustStrip.module.css";

const TRUST_KEYS = ["stripe", "secure", "payouts", "support"];

export default function ContractorTrustStrip({ compact = false }) {
  const { t } = useTranslation();

  return (
    <ul
      className={compact ? styles.stripCompact : styles.strip}
      aria-label={t("trustStrip.ariaLabel")}
    >
      {TRUST_KEYS.map((key) => (
        <li key={key} className={styles.item}>
          <span className={styles.icon} aria-hidden>
            {key === "stripe" ? "◆" : key === "secure" ? "✓" : key === "payouts" ? "→" : "◎"}
          </span>
          <span>{t(`trustStrip.items.${key}`)}</span>
        </li>
      ))}
    </ul>
  );
}
