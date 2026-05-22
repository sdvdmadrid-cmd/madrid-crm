"use client";

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { BILL_PAY_CATEGORIES } from "@/lib/bill-payments-catalog";
import styles from "./BillPaymentsSecureShell.module.css";

export default function BillPaymentsSecureShell({
  activeTab = "bills",
  onTabChange,
  onCategoryPick,
  activeCategory = "all",
}) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <section className={styles.shell}>
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{t("billPayHub.eyebrow")}</p>
          <h2 className={styles.title}>{t("billPayHub.title")}</h2>
          <p className={styles.sub}>{t("billPayHub.subtitle")}</p>
        </div>
      </div>

      <nav className={styles.tabs} aria-label={t("billPayHub.tabsLabel")}>
        <button
          type="button"
          className={
            activeTab === "bills" ? styles.tabActive : styles.tab
          }
          onClick={() => onTabChange?.("bills")}
        >
          {t("billPayHub.tabBills")}
        </button>
        <button
          type="button"
          className={
            activeTab === "wallet" ? styles.tabActive : styles.tab
          }
          onClick={() => onTabChange?.("wallet")}
        >
          {t("billPayHub.tabWallet")}
        </button>
        <button
          type="button"
          className={styles.tabSecondary}
          onClick={() => router.push("/bill-payments/processing-center")}
        >
          {t("billPayHub.tabActivity")}
        </button>
      </nav>

      <ul className={styles.badges}>
        <li>{t("billPayHub.badgeStripe")}</li>
        <li>{t("billPayHub.badgeTenant")}</li>
        <li>{t("billPayHub.badgeMasked")}</li>
        <li>{t("billPayHub.badgeLimits")}</li>
      </ul>

      {activeTab === "bills" && (
        <div className={styles.categories}>
          <p className={styles.catLabel}>{t("billPayHub.findPayee")}</p>
          <div className={styles.catGrid}>
            <button
              type="button"
              className={
                activeCategory === "all" ? styles.catChipActive : styles.catChip
              }
              onClick={() => onCategoryPick?.("all", "")}
            >
              {t("billPayHub.allCategories")}
            </button>
            {BILL_PAY_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                title={cat.description}
                className={
                  activeCategory === cat.id
                    ? styles.catChipActive
                    : styles.catChip
                }
                onClick={() => onCategoryPick?.(cat.id, cat.label)}
              >
                <span aria-hidden>{cat.icon}</span> {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
