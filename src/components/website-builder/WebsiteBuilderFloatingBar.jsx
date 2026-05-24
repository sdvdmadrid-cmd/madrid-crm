"use client";

import styles from "./website-builder.module.css";

/**
 * Minimal preview controls — devices on preview step, publish on publish step.
 */
export default function WebsiteBuilderFloatingBar({
  t,
  builderStep = 4,
  device,
  onDeviceChange,
  onOpenSettings,
  onPublish,
  publishing,
  published,
  saving,
  themePresets,
  themeColor,
  onThemeChange,
}) {
  if (builderStep !== 3 && builderStep !== 4 && builderStep !== 5) return null;

  return (
    <div className={styles.floatingBar}>
      <div className={styles.floatingBarInner}>
        {(builderStep === 4 || builderStep === 3) && (
          <div className={styles.deviceGroup}>
            {["desktop", "tablet", "mobile"].map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.deviceBtn} ${device === d ? styles.deviceBtnActive : ""}`}
                onClick={() => onDeviceChange(d)}
                title={d}
                aria-label={d}
              >
                {d === "desktop" ? "🖥" : d === "tablet" ? "📱" : "📲"}
              </button>
            ))}
          </div>
        )}

        {builderStep === 3 && themePresets?.length ? (
          <>
            <span className={styles.floatingDivider} />
            {themePresets.slice(0, 5).map((p) => (
              <button
                key={p.value}
                type="button"
                className={`${styles.floatingSwatch} ${themeColor === p.value ? styles.floatingSwatchActive : ""}`}
                style={{ background: p.value }}
                title={p.label}
                onClick={() => onThemeChange?.(p.value)}
              />
            ))}
            <button
              type="button"
              className={`${styles.floatingBtn} ${styles.floatingBtnGhost}`}
              onClick={onOpenSettings}
            >
              {t.builderSettings}
            </button>
          </>
        ) : null}

        {builderStep === 5 ? (
          <button
            type="button"
            className={`${styles.floatingBtn} ${published ? styles.floatingBtnDanger : styles.floatingBtnPub}`}
            disabled={publishing || saving}
            onClick={onPublish}
          >
            {publishing ? t.publishing : published ? t.unpublish : t.publishLive}
          </button>
        ) : null}
      </div>
    </div>
  );
}
