"use client";

import styles from "./website-builder.module.css";

export default function CompanyBrandMark({
  logoUrl = "",
  companyName = "",
  themeColor = "#1d4ed8",
  variant = "nav",
  animate = false,
  showName = true,
  tagline = "",
  phone = "",
  logoFill = false,
}) {
  const initial = String(companyName || "?").charAt(0).toUpperCase();
  const rootClass = [
    styles.brandMark,
    styles[`brandMark_${variant}`],
    animate ? styles.brandMarkAnimate : "",
    !showName ? styles.brandMark_logoOnly : "",
    logoFill ? styles.brandMark_logoFill : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} data-variant={variant}>
      <div
        className={styles.brandMarkLogoShell}
        style={{ "--brand-accent": themeColor }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt={companyName || "Company logo"} className={styles.brandMarkLogoImg} />
        ) : (
          <span className={styles.brandMarkLogoFallback} aria-hidden>
            {initial}
          </span>
        )}
      </div>
      {showName ? (
        <div className={styles.brandMarkText}>
          <strong className={styles.brandMarkName}>{companyName}</strong>
          {tagline ? <span className={styles.brandMarkTagline}>{tagline}</span> : null}
          {phone ? <span className={styles.brandMarkPhone}>{phone}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
