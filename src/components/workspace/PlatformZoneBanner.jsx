"use client";

import styles from "./platform-zone.module.css";

const COPY = {
  private: {
    title: "Private FieldBase workspace",
    body: "Leads, CRM, invoices, scheduling, and internal notes stay here. Homeowners only see your published public website — never this dashboard.",
  },
  public: {
    title: "Public contractor website",
    body: "This page is for homeowners. Request forms submit leads to your private FieldBase inbox — internal data is never shown here.",
  },
};

export default function PlatformZoneBanner({ zone = "private" }) {
  const copy = COPY[zone] || COPY.private;
  return (
    <div
      className={`${styles.banner} ${zone === "public" ? styles.bannerPublic : styles.bannerPrivate}`}
      role="note"
    >
      <div className={styles.icon}>{zone === "public" ? "🌐" : "🔒"}</div>
      <div>
        <p className={styles.title}>{copy.title}</p>
        <p className={styles.body}>{copy.body}</p>
      </div>
    </div>
  );
}
