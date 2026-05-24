"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import ContractorTrustStrip from "@/components/workspace/ContractorTrustStrip";
import styles from "./PaymentsReadinessBanner.module.css";

export default function PaymentsReadinessBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/payments/connect/status");
      const json = await getJsonOrThrow(res, "status");
      setStatus(json.data || null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className={`${styles.banner} ${styles.banner_loading} fb-shimmer`} />
    );
  }

  if (status?.onboarded) {
    return (
      <section className={`${styles.banner} ${styles.banner_ready}`}>
        <div className={styles.content}>
          <p className={styles.kicker}>{t("paymentsBanner.ready.kicker")}</p>
          <h2 className={styles.title}>{t("paymentsBanner.ready.title")}</h2>
          <p className={styles.body}>{t("paymentsBanner.ready.body")}</p>
        </div>
        <div className={styles.actions}>
          <Link href="/invoices" className={styles.primary}>
            {t("paymentsBanner.ready.cta")}
          </Link>
          <Link href="/settings/payments" className={styles.secondary}>
            {t("paymentsBanner.ready.manage")}
          </Link>
        </div>
      </section>
    );
  }

  const featureOff = !status?.enabled;

  return (
    <section
      className={`${styles.banner} ${featureOff ? styles.banner_soon : styles.banner_action}`}
    >
      <div className={styles.content}>
        <p className={styles.kicker}>
          {featureOff
            ? t("paymentsBanner.setup.kickerSoon")
            : t("paymentsBanner.setup.kicker")}
        </p>
        <h2 className={styles.title}>
          {featureOff
            ? t("paymentsBanner.setup.titleSoon")
            : t("paymentsBanner.setup.title")}
        </h2>
        <p className={styles.body}>
          {featureOff
            ? t("paymentsBanner.setup.bodySoon")
            : t("paymentsBanner.setup.body")}
        </p>
        <ContractorTrustStrip compact />
      </div>
      <div className={styles.actions}>
        <Link href="/settings/payments" className={styles.primary}>
          {featureOff
            ? t("paymentsBanner.setup.ctaSoon")
            : t("paymentsBanner.setup.cta")}
        </Link>
        <Link href="/invoices" className={styles.secondary}>
          {t("paymentsBanner.setup.invoices")}
        </Link>
      </div>
    </section>
  );
}
