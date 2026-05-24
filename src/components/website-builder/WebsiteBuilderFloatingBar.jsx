"use client";

import styles from "./website-builder.module.css";

export default function WebsiteBuilderFloatingBar({
  t,
  device,
  onDeviceChange,
  onRegenerate,
  generating,
  onToggleAdvanced,
  advancedOpen,
  onPublish,
  publishing,
  published,
  saving,
  themePresets,
  themeColor,
  onThemeChange,
  selectedSection,
  onRegenerateSection,
  regeneratingSection,
}) {
  return (
    <div className={styles.floatingBar}>
      <div className={styles.floatingBarInner}>
        <div className={styles.deviceGroup}>
          {["desktop", "tablet", "mobile"].map((d) => (
            <button
              key={d}
              type="button"
              className={`${styles.deviceBtn} ${device === d ? styles.deviceBtnActive : ""}`}
              onClick={() => onDeviceChange(d)}
              title={d}
            >
              {d === "desktop" ? "🖥" : d === "tablet" ? "📱" : "📲"}
            </button>
          ))}
        </div>

        <span className={styles.floatingDivider} />

        {themePresets?.slice(0, 5).map((p) => (
          <button
            key={p.value}
            type="button"
            className={`${styles.floatingSwatch} ${themeColor === p.value ? styles.floatingSwatchActive : ""}`}
            style={{ background: p.value }}
            title={p.label}
            onClick={() => onThemeChange(p.value)}
          />
        ))}

        <span className={styles.floatingDivider} />

        {selectedSection ? (
          <button
            type="button"
            className={`${styles.floatingBtn} ${styles.floatingBtnGhost}`}
            disabled={Boolean(regeneratingSection)}
            onClick={() => onRegenerateSection?.(selectedSection)}
          >
            {regeneratingSection ? t.generating : `↻ ${t.regenerateSection}`}
          </button>
        ) : null}

        <button
          type="button"
          className={`${styles.floatingBtn} ${styles.floatingBtnAi}`}
          disabled={generating}
          onClick={onRegenerate}
        >
          {generating ? t.generatingFull : `✨ ${t.generateFull}`}
        </button>

        <button
          type="button"
          className={`${styles.floatingBtn} ${styles.floatingBtnGhost}`}
          onClick={onToggleAdvanced}
        >
          {advancedOpen ? t.hideAdvanced : t.showAdvanced}
        </button>

        <button
          type="button"
          className={`${styles.floatingBtn} ${published ? styles.floatingBtnDanger : styles.floatingBtnPub}`}
          disabled={publishing || saving}
          onClick={onPublish}
        >
          {publishing ? t.publishing : published ? t.unpublish : t.publish}
        </button>
      </div>
    </div>
  );
}
