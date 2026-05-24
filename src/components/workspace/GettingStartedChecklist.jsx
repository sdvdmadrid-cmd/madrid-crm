"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import styles from "./GettingStartedChecklist.module.css";

/**
 * @param {{ steps: { id: string, done: boolean, href: string, labelKey: string, descKey: string }[] }} props
 */
export default function GettingStartedChecklist({ steps }) {
  const { t } = useTranslation();
  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (completed >= total) {
    return null;
  }

  return (
    <section className={styles.panel} aria-labelledby="getting-started-title">
      <div className={styles.head}>
        <div>
          <p className={styles.kicker}>{t("gettingStarted.kicker")}</p>
          <h2 id="getting-started-title" className={styles.title}>
            {t("gettingStarted.title")}
          </h2>
          <p className={styles.subtitle}>{t("gettingStarted.subtitle")}</p>
        </div>
        <div className={styles.progressWrap}>
          <span className={styles.progressLabel}>
            {t("gettingStarted.progress", { completed, total })}
          </span>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
      <ol className={styles.list}>
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`${styles.step} ${step.done ? styles.step_done : ""}`}
          >
            <span className={styles.stepNum} aria-hidden>
              {step.done ? "✓" : index + 1}
            </span>
            <div className={styles.stepBody}>
              <p className={styles.stepTitle}>{t(step.labelKey)}</p>
              <p className={styles.stepDesc}>{t(step.descKey)}</p>
            </div>
            {!step.done ? (
              <Link href={step.href} className={styles.stepCta}>
                {t("gettingStarted.go")}
              </Link>
            ) : (
              <span className={styles.stepDone}>{t("gettingStarted.done")}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
