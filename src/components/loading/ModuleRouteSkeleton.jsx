import styles from "./module-route-skeleton.module.css";

function Shimmer({ className = "" }) {
  return <div className={`fb-shimmer ${className}`.trim()} aria-hidden="true" />;
}

export default function ModuleRouteSkeleton({ variant = "list" }) {
  return (
    <div className={styles.moduleShell} role="status" aria-label="Loading">
      <div className={styles.headerBlock}>
        <Shimmer className={styles.titleBar} />
        <Shimmer className={styles.subtitleBar} />
      </div>

      {variant === "dashboard" ? (
        <div className={styles.dashboardGrid}>
          <Shimmer className={styles.dashboardHero} />
          <Shimmer className={styles.dashboardSide} />
          <Shimmer className={styles.dashboardSide} />
        </div>
      ) : (
        <>
          <div className={styles.metricsGrid}>
            <Shimmer className={styles.metricCard} />
            <Shimmer className={styles.metricCard} />
            <Shimmer className={styles.metricCard} />
          </div>
          <Shimmer className={styles.listPanel} />
        </>
      )}
    </div>
  );
}
