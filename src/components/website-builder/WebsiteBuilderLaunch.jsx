"use client";

import styles from "./website-builder.module.css";

export default function WebsiteBuilderLaunch({
  t,
  companyProfile,
  industryLabel,
  industryIcon,
  industryPackOptions,
  industryKeyOverride,
  onIndustryChange,
  onGenerate,
  generating,
  genProgress,
  completenessScore,
}) {
  const companyName =
    companyProfile?.publicDisplayName ||
    companyProfile?.companyName ||
    t.launchCompanyFallback;
  const city =
    companyProfile?.businessCity || companyProfile?.city || t.launchCityFallback;

  return (
    <div className={styles.launchCard}>
      <div className={styles.launchGlow} aria-hidden />
      <div className={styles.launchInner}>
        <p className={styles.launchEyebrow}>{t.launchEyebrow}</p>
        <h2 className={styles.launchTitle}>{t.launchTitle}</h2>
        <p className={styles.launchSubtitle}>{t.launchSubtitle}</p>

        <div className={styles.launchFacts}>
          <div className={styles.launchFact}>
            <span className={styles.launchFactLabel}>{t.launchCompany}</span>
            <strong>{companyName}</strong>
          </div>
          <div className={styles.launchFact}>
            <span className={styles.launchFactLabel}>{t.launchLocation}</span>
            <strong>{city}</strong>
          </div>
          <div className={styles.launchFact}>
            <span className={styles.launchFactLabel}>{t.launchIndustry}</span>
            <strong>
              {industryIcon} {industryLabel}
            </strong>
          </div>
        </div>

        {industryPackOptions.length > 0 ? (
          <label className={styles.launchIndustrySelect}>
            <span>{t.launchIndustryPick}</span>
            <select
              value={industryKeyOverride || ""}
              onChange={onIndustryChange}
              disabled={generating}
            >
              <option value="">{t.industryUseProfile}</option>
              {industryPackOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.icon ? `${opt.icon} ` : ""}
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="button"
          className={`${styles.btn} ${styles.btnLaunch}`}
          disabled={generating}
          onClick={onGenerate}
        >
          {generating ? genProgress || t.generatingFull : t.generateFull}
        </button>

        {generating && genProgress ? (
          <p className={styles.launchProgress}>{genProgress}</p>
        ) : null}

        {!generating && completenessScore > 0 ? (
          <p className={styles.launchHint}>
            {t.launchCompleteness.replace("{score}", String(completenessScore))}
          </p>
        ) : (
          <p className={styles.launchHint}>{t.launchHint}</p>
        )}

        <ul className={styles.launchList}>
          <li>{t.launchBullet1}</li>
          <li>{t.launchBullet2}</li>
          <li>{t.launchBullet3}</li>
        </ul>
      </div>
    </div>
  );
}
