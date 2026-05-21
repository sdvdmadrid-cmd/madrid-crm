"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import styles from "./InvoiceClientPaymentsGuide.module.css";

const STORAGE_KEY = "fieldbase_invoices_guide_collapsed";

function CheckIcon({ ok }) {
  return (
    <span aria-hidden className={ok ? styles.checkOk : styles.checkMissing}>
      {ok ? "\u2713" : "\u2717"}
    </span>
  );
}

export default function InvoiceClientPaymentsGuide({
  defaultExpanded = false,
  stripePublishableConfigured = false,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [setup, setSetup] = useState(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [copyNotice, setCopyNotice] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const collapsed = window.localStorage.getItem(STORAGE_KEY) === "1";
    setExpanded(defaultExpanded || !collapsed);
  }, [defaultExpanded]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSetup(true);
        const res = await apiFetch("/api/invoices/payment-setup-status");
        const json = await getJsonOrThrow(
          res,
          t("invoices.guide.setupLoadError"),
        );
        if (!cancelled) {
          setSetup(json.data || null);
        }
      } catch {
        if (!cancelled) {
          setSetup(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingSetup(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const dismiss = useCallback(() => {
    setExpanded(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }, []);

  const showAgain = useCallback(() => {
    setExpanded(true);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const copyWebhookUrl = useCallback(async () => {
    const url = String(setup?.webhookEndpointUrl || "").trim();
    if (!url || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyNotice(t("invoices.guide.copied"));
      window.setTimeout(() => setCopyNotice(""), 2500);
    } catch {
      setCopyNotice(t("invoices.guide.copyFailed"));
    }
  }, [setup?.webhookEndpointUrl, t]);

  const ready =
    setup?.ready ??
    (stripePublishableConfigured && setup?.secretKeyConfigured);

  const steps = [
    {
      title: t("invoices.guide.step1Title"),
      body: t("invoices.guide.step1Body"),
    },
    {
      title: t("invoices.guide.step2Title"),
      body: t("invoices.guide.step2Body"),
    },
    {
      title: t("invoices.guide.step3Title"),
      body: t("invoices.guide.step3Body"),
    },
    {
      title: t("invoices.guide.step4Title"),
      body: t("invoices.guide.step4Body"),
    },
  ];

  const checks = setup
    ? [
        {
          label: t("invoices.guide.checkPublishable"),
          ok: setup.publishableKeyConfigured,
        },
        {
          label: t("invoices.guide.checkSecret"),
          ok: setup.secretKeyConfigured,
        },
        {
          label: t("invoices.guide.checkWebhook"),
          ok: setup.webhookSecretConfigured,
        },
        {
          label: t("invoices.guide.checkAppUrl"),
          ok: setup.appUrlConfigured,
        },
      ]
    : [];

  if (!expanded) {
    return (
      <div className={styles.collapsedBar}>
        <p className={styles.collapsedText}>{t("invoices.guide.collapsedHint")}</p>
        <button type="button" className={styles.btnGhost} onClick={showAgain}>
          {t("invoices.guide.show")}
        </button>
      </div>
    );
  }

  return (
    <section className={styles.guide} aria-labelledby="invoice-payments-guide-title">
      <div className={styles.header}>
        <div>
          <h2 id="invoice-payments-guide-title" className={styles.title}>
            {t("invoices.guide.title")}
          </h2>
          <p className={styles.subtitle}>{t("invoices.guide.subtitle")}</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={dismiss}>
            {t("invoices.guide.dismiss")}
          </button>
        </div>
      </div>

      <div className={styles.body}>
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNum}>{index + 1}</span>
              <div>
                <p className={styles.stepTitle}>{step.title}</p>
                <p className={styles.stepBody}>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className={styles.stripePanel}>
          <p className={styles.stripeTitle}>{t("invoices.guide.stripeTitle")}</p>
          {loadingSetup ? (
            <p className={styles.stripeStatus}>{t("invoices.guide.stripeLoading")}</p>
          ) : (
            <p
              className={`${styles.stripeStatus} ${
                ready ? styles.stripeReady : styles.stripePending
              }`}
            >
              {ready
                ? t("invoices.guide.stripeReady")
                : t("invoices.guide.stripeNotReady")}
            </p>
          )}
          {checks.length > 0 ? (
            <ul className={styles.checkList}>
              {checks.map((item) => (
                <li key={item.label} className={styles.checkItem}>
                  <CheckIcon ok={item.ok} />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
          {setup?.webhookEndpointUrl ? (
            <div className={styles.webhookBox}>
              <div>{t("invoices.guide.webhookHint")}</div>
              <div className={styles.webhookRow}>
                <code className={styles.webhookUrl}>
                  {setup.webhookEndpointUrl}
                </code>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={copyWebhookUrl}
                >
                  {t("invoices.guide.copyWebhook")}
                </button>
              </div>
              {copyNotice ? <div style={{ marginTop: 8 }}>{copyNotice}</div> : null}
              <div style={{ marginTop: 8 }}>{t("invoices.guide.webhookEvents")}</div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
