"use client";

import Link from "next/link";
import styles from "./website-builder.module.css";
import CompanyLogoPanel from "./CompanyLogoPanel";

export default function WebsiteBuilderSetupPanel({
  t,
  companyProfile,
  serviceCount = 0,
  galleryCount = 0,
  logoUrl = "",
  onContinue,
  onCompanyProfileChange,
}) {
  const effectiveLogoUrl =
    String(logoUrl || "").trim() ||
    String(companyProfile?.logoUrl || "").trim() ||
    String(companyProfile?.logoDataUrl || "").trim();
  const logoPlacement = String(companyProfile?.logoPlacement || "top-left");
  const companyName =
    companyProfile?.publicDisplayName || companyProfile?.companyName || t.launchCompanyFallback;
  const phone = companyProfile?.phone || "—";
  const city = companyProfile?.businessCity || companyProfile?.city || t.launchCityFallback;

  return (
    <div className={styles.setupPanel}>
      <h2 className={styles.setupTitle}>{t.stepSetupTitle}</h2>
      <p className={styles.setupSub}>{t.stepSetupSub}</p>

      <div className={styles.setupCard}>
        {effectiveLogoUrl ? (
          <img src={effectiveLogoUrl} alt="" className={styles.setupLogo} />
        ) : (
          <div className={styles.setupLogoPlaceholder}>{companyName.charAt(0) || "?"}</div>
        )}
        <div>
          <strong className={styles.setupCompany}>{companyName}</strong>
          <p className={styles.setupMeta}>
            {city} · {phone}
          </p>
          <p className={styles.setupMeta}>
            {t.stepSetupServicesCount.replace("{n}", String(serviceCount))} ·{" "}
            {t.stepSetupPhotosCount.replace("{n}", String(galleryCount))}
          </p>
        </div>
      </div>

      <CompanyLogoPanel
        t={t}
        logoUrl={effectiveLogoUrl}
        logoPlacement={logoPlacement}
        companyProfile={companyProfile || {}}
        onChange={(next) => {
          if (typeof onCompanyProfileChange === "function") {
            onCompanyProfileChange({
              ...(companyProfile || {}),
              logoUrl: next.logoUrl,
              logoPlacement: next.logoPlacement,
            });
          }
        }}
      />


      <ul className={styles.setupList}>
        <li>{t.stepSetupBullet1}</li>
        <li>{t.stepSetupBullet2}</li>
        <li>{t.stepSetupBullet3}</li>
      </ul>

      {t.setupAiHint ? <p className={styles.setupAiHint}>{t.setupAiHint}</p> : null}

      <div className={styles.setupActions}>
        <Link href="/settings" className={`${styles.btn} ${styles.btnGhost}`}>
          {t.stepSetupEditProfile}
        </Link>
        <Link href="/services-catalog" className={`${styles.btn} ${styles.btnGhost}`}>
          {t.stepSetupEditServices}
        </Link>
        <button type="button" className={`${styles.btn} ${styles.btnSave}`} onClick={onContinue}>
          {t.stepSetupContinue}
        </button>
      </div>
    </div>
  );
}
