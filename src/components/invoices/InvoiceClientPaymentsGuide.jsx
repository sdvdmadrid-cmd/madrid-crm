"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { resolveConnectOnboardError } from "@/lib/stripe-connect-client";
import styles from "./InvoiceClientPaymentsGuide.module.css";

const STORAGE_KEY = "fieldbase_invoices_guide_collapsed";

function CheckIcon({ ok }) {
  return (
    <span aria-hidden className={ok ? styles.checkOk : styles.checkMissing}>
      {ok ? "\u2713" : "\u2717"}
    </span>
  );
}

function WorkflowSteps({ steps }) {
  return (
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
  );
}

/**
 * @param {"contractor"|"platform"} props.variant
 * - contractor: 4-step workflow only (invoices page for businesses)
 * - platform: Stripe env / webhook diagnostics (owner monitoring only)
 */
export default function InvoiceClientPaymentsGuide({
  defaultExpanded = false,
  stripePublishableConfigured = false,
  variant = "contractor",
}) {
  const { t } = useTranslation();
  const isPlatformVariant = variant === "platform";
  const storageKey = isPlatformVariant
    ? "fieldbase_invoices_platform_guide_collapsed"
    : STORAGE_KEY;

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [setup, setSetup] = useState(null);
  const [loadingSetup, setLoadingSetup] = useState(isPlatformVariant);
  const [copyNotice, setCopyNotice] = useState("");
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [isPlatformOwner, setIsPlatformOwner] = useState(!isPlatformVariant);
  const [roleChecked, setRoleChecked] = useState(!isPlatformVariant);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const collapsed = window.localStorage.getItem(storageKey) === "1";
    setExpanded(defaultExpanded || !collapsed);
  }, [defaultExpanded, storageKey]);

  useEffect(() => {
    if (!isPlatformVariant) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auth/me", {
          cache: "no-store",
          suppressUnauthorizedEvent: true,
        });
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        if (!cancelled) {
          setIsPlatformOwner(
            String(payload?.data?.role || "").toLowerCase() === "super_admin",
          );
          setRoleChecked(true);
        }
      } catch {
        if (!cancelled) {
          setIsPlatformOwner(false);
          setRoleChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPlatformVariant]);

  useEffect(() => {
    if (!isPlatformVariant || !roleChecked || !isPlatformOwner) return undefined;
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
  }, [isPlatformOwner, isPlatformVariant, roleChecked, t]);

  const dismiss = useCallback(() => {
    setExpanded(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1");
    }
  }, [storageKey]);

  const showAgain = useCallback(() => {
    setExpanded(true);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

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
    setup?.cardPaymentsReady ??
    setup?.ready ??
    (stripePublishableConfigured && setup?.secretKeyConfigured);

  const connect = setup?.connect || null;

  const startConnectOnboarding = useCallback(async () => {
    setConnectError("");
    setConnectLoading(true);
    try {
      const res = await apiFetch("/api/payments/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await getJsonOrThrow(res, "Unable to start Stripe Connect");
      const url = String(json?.data?.url || "").trim();
      if (!url) {
        throw new Error("Missing onboarding URL");
      }
      window.location.href = url;
    } catch (err) {
      setConnectError(resolveConnectOnboardError(err, t, { isPlatformOwner: true }));
    } finally {
      setConnectLoading(false);
    }
  }, [t]);

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

  if (isPlatformVariant) {
    if (!roleChecked || !isPlatformOwner) {
      return null;
    }
  }

  if (!expanded) {
    return (
      <div className={styles.collapsedBar}>
        <p className={styles.collapsedText}>
          {isPlatformVariant
            ? t("invoices.guide.platformCollapsedHint", {
                defaultValue: "Platform Stripe setup (owner only)",
              })
            : t("invoices.guide.collapsedHint")}
        </p>
        <button type="button" className={styles.btnGhost} onClick={showAgain}>
          {t("invoices.guide.show")}
        </button>
      </div>
    );
  }

  const titleId = isPlatformVariant
    ? "invoice-platform-stripe-guide-title"
    : "invoice-payments-guide-title";

  return (
    <section className={styles.guide} aria-labelledby={titleId}>
      <div className={styles.header}>
        <div>
          <h2 id={titleId} className={styles.title}>
            {isPlatformVariant
              ? t("invoices.guide.platformTitle", {
                  defaultValue: "Platform Stripe configuration",
                })
              : t("invoices.guide.title")}
          </h2>
          <p className={styles.subtitle}>
            {isPlatformVariant
              ? t("invoices.guide.platformSubtitle", {
                  defaultValue:
                    "Environment variables and webhooks — visible only to FieldBase platform owner.",
                })
              : t("invoices.guide.subtitle")}
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={dismiss}>
            {t("invoices.guide.dismiss")}
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {!isPlatformVariant ? <WorkflowSteps steps={steps} /> : null}

        {isPlatformVariant ? (
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
            {connect?.enabled ? (
              <div className={styles.webhookBox} style={{ marginTop: 12 }}>
                <div>
                  <strong>Contractor payouts (Stripe Connect)</strong>
                </div>
                <p style={{ margin: "8px 0", fontSize: 14 }}>
                  {connect.onboarded
                    ? "Payout account connected — card payments route to your Stripe balance."
                    : "Connect Stripe to receive customer card payments with automatic payouts."}
                </p>
                {!connect.onboarded ? (
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={connectLoading}
                    onClick={startConnectOnboarding}
                  >
                    {connectLoading ? "Opening Stripe…" : "Connect payout account"}
                  </button>
                ) : null}
                {connectError ? (
                  <p style={{ marginTop: 8, color: "#fca5a5", fontSize: 13 }}>
                    {connectError}
                  </p>
                ) : null}
              </div>
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
        ) : null}
      </div>
    </section>
  );
}
