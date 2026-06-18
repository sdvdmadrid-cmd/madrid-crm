"use client";

import styles from "./website-builder.module.css";
import { resolveCompanyLogoUrl } from "@/lib/resolve-company-logo-url";
import CompanyBrandMark from "./CompanyBrandMark";

export default function WebsiteBuilderLaunch({
  t,
  companyProfile,
  onGenerate,
  onOpenAssistant,
  onCancel,
  generating,
  genProgress,
  completenessScore,
  themeColor = "#1d4ed8",
  hasExistingDraft = false,
}) {
  const logoUrl = resolveCompanyLogoUrl(companyProfile);
  const companyName =
    companyProfile?.publicDisplayName ||
    companyProfile?.companyName ||
    t.launchCompanyFallback;

  return (
    <div className={styles.launchCard}>
      <div className={styles.launchGlow} aria-hidden />
      <div className={styles.launchInner}>
        <div className={styles.launchBrandCenter}>
          <CompanyBrandMark
            logoUrl={logoUrl}
            companyName={companyName}
            themeColor={themeColor}
            variant="heroCenter"
            animate
            showName={false}
          />
        </div>

        <p className={styles.launchEyebrow}>{t.launchEyebrowCompany}</p>
        <h2 className={styles.launchTitle}>{t.launchTitleCompany}</h2>
        <p className={styles.launchSubtitle}>{t.launchSubtitleCompany}</p>

        <div className={styles.launchActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnLaunch}`}
            disabled={generating}
            onClick={onGenerate}
          >
            {generating
              ? genProgress || t.generatingFull
              : hasExistingDraft
                ? t.generateFullRebuild || t.generateFull
                : t.generateFull}
          </button>
          {onOpenAssistant ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              disabled={generating}
              onClick={onOpenAssistant}
            >
              {t.launchOpenAi}
            </button>
          ) : null}
          {generating && onCancel ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={onCancel}
            >
              {t.genCancel}
            </button>
          ) : null}
        </div>

        {generating && genProgress ? (
          <p className={styles.launchProgress}>{genProgress}</p>
        ) : null}

        {!generating && completenessScore > 0 ? (
          <p className={styles.launchHint}>
            {t.launchCompleteness.replace("{score}", String(completenessScore))}
          </p>
        ) : (
          <p className={styles.launchHint}>{t.launchHintCompany}</p>
        )}

        <ul className={styles.launchList}>
          <li>{t.launchBulletCompany1}</li>
          <li>{t.launchBulletCompany2}</li>
          <li>{t.launchBulletCompany3}</li>
        </ul>
        {onOpenAssistant && t.launchOpenAiHint ? (
          <p className={styles.launchHint}>{t.launchOpenAiHint}</p>
        ) : null}
      </div>
    </div>
  );
}
