"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import ContractorTrustStrip from "@/components/workspace/ContractorTrustStrip";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { resolveConnectOnboardError } from "@/lib/stripe-connect-client";
import { CONNECT_ERROR_CODE } from "@/lib/stripe-connect-codes";
import styles from "./ContractorPaymentsSettings.module.css";

function StatusBadge({ variant, children }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${variant}`]}`}>
      {children}
    </span>
  );
}

export default function ContractorPaymentsSettings() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const connectParam = String(searchParams.get("connect") || "").trim();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorIsPlatformSetup, setErrorIsPlatformSetup] = useState(false);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setError("");
    try {
      setLoading(true);
      const res = await apiFetch("/api/payments/connect/status");
      const json = await getJsonOrThrow(
        res,
        t("settingsPayments.errors.loadStatus"),
      );
      setStatus(json.data || null);
    } catch (err) {
      setStatus(null);
      setError(err?.message || t("settingsPayments.errors.loadStatus"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auth/me", {
          cache: "no-store",
          suppressUnauthorizedEvent: true,
        });
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        const role = String(payload?.data?.role || "").toLowerCase();
        if (!cancelled) {
          setIsPlatformOwner(role === "super_admin");
        }
      } catch {
        if (!cancelled) setIsPlatformOwner(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (connectParam === "return") {
      setNotice(t("settingsPayments.notices.returnFromStripe"));
      loadStatus();
    } else if (connectParam === "refresh") {
      setNotice(t("settingsPayments.notices.refreshFromStripe"));
    }
  }, [connectParam, loadStatus, t]);

  const phase = useMemo(() => {
    if (!status?.enabled) return "coming_soon";
    if (!status?.configured) return "not_connected";
    if (!status?.onboarded) return "pending";
    return "active";
  }, [status]);

  const startOnboarding = useCallback(async () => {
    setActionLoading(true);
    setError("");
    setErrorIsPlatformSetup(false);
    try {
      const res = await apiFetch("/api/payments/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await getJsonOrThrow(
        res,
        t("settingsPayments.errors.onboard"),
      );
      const url = String(json?.data?.url || "").trim();
      if (!url) {
        throw new Error(t("settingsPayments.errors.missingUrl"));
      }
      window.location.href = url;
    } catch (err) {
      const isPlatformSetup =
        err?.code === CONNECT_ERROR_CODE.PLATFORM_NOT_ENABLED ||
        String(err?.message || "").includes("STRIPE_CONNECT_PLATFORM_NOT_ENABLED");
      setErrorIsPlatformSetup(isPlatformSetup);
      setError(resolveConnectOnboardError(err, t, { isPlatformOwner }));
    } finally {
      setActionLoading(false);
    }
  }, [isPlatformOwner, t]);

  const openStripeDashboard = useCallback(async () => {
    setActionLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/payments/connect/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await getJsonOrThrow(
        res,
        t("settingsPayments.errors.dashboard"),
      );
      const url = String(json?.data?.url || "").trim();
      if (!url) {
        throw new Error(t("settingsPayments.errors.missingUrl"));
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.message || t("settingsPayments.errors.dashboard"));
    } finally {
      setActionLoading(false);
    }
  }, [t]);

  const statusLabel =
    phase === "active"
      ? t("settingsPayments.status.active")
      : phase === "pending"
        ? t("settingsPayments.status.pending")
        : phase === "not_connected"
          ? t("settingsPayments.status.notConnected")
          : t("settingsPayments.status.comingSoon");

  const statusVariant =
    phase === "active"
      ? "success"
      : phase === "pending"
        ? "warning"
        : phase === "not_connected"
          ? "neutral"
          : "muted";

  return (
    <PremiumPageShell
      title={t("settingsPayments.title")}
      subtitle={t("settingsPayments.subtitle")}
      actions={
        <Link href="/settings" className={styles.backLink}>
          ← {t("settingsPayments.backToSettings")}
        </Link>
      }
    >
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? (
        <div className={styles.error}>
          <p>{error}</p>
          {errorIsPlatformSetup && isPlatformOwner ? (
            <p className={styles.errorActions}>
              <a
                href="https://dashboard.stripe.com/connect"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.errorLink}
              >
                {t("settingsPayments.errors.openStripeConnect")}
              </a>
              {" · "}
              <Link href="/owner/settings" className={styles.errorLink}>
                {t("settingsPayments.errors.ownerSetupGuide")}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <section className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>{t("settingsPayments.kicker")}</p>
            <h2 className={styles.heroTitle}>
              {t("settingsPayments.heroTitle")}
            </h2>
          </div>
          {loading ? (
            <StatusBadge variant="muted">
              {t("settingsPayments.loading")}
            </StatusBadge>
          ) : (
            <StatusBadge variant={statusVariant}>{statusLabel}</StatusBadge>
          )}
        </div>
        <p className={styles.heroBody}>{t("settingsPayments.heroBody")}</p>
        <ContractorTrustStrip />

        <ul className={styles.featureList}>
          <li>{t("settingsPayments.features.sendInvoices")}</li>
          <li>{t("settingsPayments.features.clientPaysOnline")}</li>
          <li>{t("settingsPayments.features.payoutsToYou")}</li>
        </ul>

        <div className={styles.actions}>
          {phase === "coming_soon" ? (
            <p className={styles.hint}>{t("settingsPayments.comingSoonHint")}</p>
          ) : null}
          {phase === "not_connected" || phase === "pending" ? (
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={actionLoading || loading || phase === "coming_soon"}
              onClick={startOnboarding}
            >
              {actionLoading
                ? t("settingsPayments.actions.openingStripe")
                : phase === "pending"
                  ? t("settingsPayments.actions.continueSetup")
                  : t("settingsPayments.actions.connectStripe")}
            </button>
          ) : null}
          {phase === "active" ? (
            <>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={actionLoading}
                onClick={openStripeDashboard}
              >
                {t("settingsPayments.actions.openDashboard")}
              </button>
              <Link href="/invoices" className={styles.secondaryBtn}>
                {t("settingsPayments.actions.goToInvoices")}
              </Link>
            </>
          ) : null}
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h3>{t("settingsPayments.howItWorks.title")}</h3>
          <ol className={styles.steps}>
            <li>{t("settingsPayments.howItWorks.step1")}</li>
            <li>{t("settingsPayments.howItWorks.step2")}</li>
            <li>{t("settingsPayments.howItWorks.step3")}</li>
            <li>{t("settingsPayments.howItWorks.step4")}</li>
          </ol>
        </section>

        <section className={styles.card}>
          <h3>{t("settingsPayments.details.title")}</h3>
          <dl className={styles.details}>
            <div>
              <dt>{t("settingsPayments.details.charges")}</dt>
              <dd>
                {status?.chargesEnabled
                  ? t("settingsPayments.details.enabled")
                  : t("settingsPayments.details.disabled")}
              </dd>
            </div>
            <div>
              <dt>{t("settingsPayments.details.payouts")}</dt>
              <dd>
                {status?.payoutsEnabled
                  ? t("settingsPayments.details.enabled")
                  : t("settingsPayments.details.disabled")}
              </dd>
            </div>
            {status?.onboardedAt ? (
              <div>
                <dt>{t("settingsPayments.details.connectedAt")}</dt>
                <dd>{new Date(status.onboardedAt).toLocaleDateString()}</dd>
              </div>
            ) : null}
          </dl>
          <p className={styles.finePrint}>
            {t("settingsPayments.details.finePrint")}
          </p>
        </section>
      </div>
    </PremiumPageShell>
  );
}
