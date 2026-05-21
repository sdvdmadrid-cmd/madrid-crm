"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PaymentMethodSetupForm from "@/components/payments/PaymentMethodSetupForm";
import styles from "@/components/payments/PaymentMethodsHub.module.css";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  formatExpiry,
  formatPaymentMethodLabel,
  paymentMethodIcon,
} from "@/lib/payment-method-labels";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function formatCurrency(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "USD").toUpperCase(),
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function loadPlaidScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Plaid is only available in the browser"));
  }
  if (window.Plaid) return Promise.resolve(window.Plaid);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-plaid-link="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Plaid), {
        once: true,
      });
      existing.addEventListener(
        "error",
        () => reject(new Error("Unable to load Plaid Link")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.plaidLink = "true";
    script.onload = () => resolve(window.Plaid);
    script.onerror = () => reject(new Error("Unable to load Plaid Link"));
    document.head.appendChild(script);
  });
}

export default function PaymentMethodsHub({
  billingName = "Cardholder",
  billingEmail = "",
  brandName = "FieldBase",
  showBillPaymentsLink = true,
  onGoToBills,
  compact = false,
  onMethodsChange,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plaidLaunching, setPlaidLaunching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [methods, setMethods] = useState([]);
  const [summary, setSummary] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [setupIntentState, setSetupIntentState] = useState({
    active: false,
    clientSecret: "",
    methodType: "card",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [methodsRes, usageRes] = await Promise.all([
        apiFetch("/api/bill-payments/payment-methods"),
        apiFetch("/api/bill-payments/payment-methods/usage"),
      ]);
      const methodsPayload = await getJsonOrThrow(
        methodsRes,
        "Unable to load payment methods.",
      );
      const usagePayload = usageRes.ok
        ? await usageRes.json().catch(() => null)
        : null;

      const list = methodsPayload.data || [];
      setMethods(list);

      if (usagePayload?.success && usagePayload.data) {
        setSummary(usagePayload.data.summary || null);
        setRecentActivity(usagePayload.data.recentActivity || []);
        if (usagePayload.data.methods?.length) {
          setMethods(usagePayload.data.methods);
        }
      } else {
        setSummary({
          totalMethods: list.length,
          cardCount: list.filter((m) => m.methodType === "card").length,
          bankCount: list.filter((m) => m.methodType === "bank_account").length,
        });
        setRecentActivity([]);
      }

      onMethodsChange?.(list);
    } catch (loadError) {
      setError(loadError.message || "Unable to load wallet.");
    } finally {
      setLoading(false);
    }
  }, [onMethodsChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const defaultMethod = useMemo(
    () => methods.find((m) => m.isDefault) || methods[0] || null,
    [methods],
  );

  async function startSetup(methodType) {
    setError("");
    setNotice("");
    if (!stripePromise) {
      setError(t("paymentMethods.stripeMissing"));
      return;
    }
    try {
      const response = await apiFetch(
        "/api/bill-payments/payment-methods/setup-intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ methodType }),
        },
      );
      const payload = await getJsonOrThrow(
        response,
        "Unable to prepare card setup.",
      );
      setSetupIntentState({
        active: true,
        clientSecret: payload.data.clientSecret,
        methodType,
      });
    } catch (setupError) {
      setError(setupError.message || "Unable to start setup.");
    }
  }

  async function markDefault(id) {
    setError("");
    try {
      const response = await apiFetch(
        `/api/bill-payments/payment-methods/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true, allowAutopay: true }),
        },
      );
      await getJsonOrThrow(response, "Unable to update method.");
      setNotice(t("paymentMethods.defaultUpdated"));
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to update method.");
    }
  }

  async function removeMethod(id) {
    setError("");
    try {
      const response = await apiFetch(
        `/api/bill-payments/payment-methods/${id}`,
        { method: "DELETE" },
      );
      await getJsonOrThrow(response, "Unable to remove method.");
      setNotice(t("paymentMethods.removed"));
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to remove method.");
    }
  }

  async function launchPlaid(existingMethod = null) {
    if (plaidLaunching) return;
    setPlaidLaunching(true);
    setError("");
    setNotice("");
    try {
      const scriptPlaid = await loadPlaidScript();
      const tokenResponse = await apiFetch(
        "/api/bill-payments/payment-methods/plaid/link-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: "en" }),
        },
      );
      const tokenPayload = await getJsonOrThrow(
        tokenResponse,
        "Unable to prepare Plaid.",
      );

      await new Promise((resolve, reject) => {
        const handler = scriptPlaid.create({
          token: tokenPayload.data.link_token,
          onSuccess: async (publicToken, metadata) => {
            try {
              const exchangeResponse = await apiFetch(
                "/api/bill-payments/payment-methods/plaid/exchange",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    publicToken,
                    accountId: metadata.accounts?.[0]?.id || "",
                    setDefault: false,
                  }),
                },
              );
              await getJsonOrThrow(exchangeResponse, "Unable to save bank.");
              setNotice(t("paymentMethods.bankLinked"));
              await loadData();
              resolve();
            } catch (linkError) {
              reject(linkError);
            } finally {
              handler.destroy();
            }
          },
          onExit: (plaidError) => {
            handler.destroy();
            if (plaidError?.error_message) {
              reject(new Error(plaidError.error_message));
              return;
            }
            resolve();
          },
        });
        handler.open();
      });
    } catch (plaidError) {
      setError(plaidError.message || "Unable to link bank.");
    } finally {
      setPlaidLaunching(false);
    }
  }

  if (loading) {
    return <div className={styles.loading}>{t("loading")}</div>;
  }

  return (
    <div className={styles.hub}>
      {!compact && (
        <section className={styles.hero}>
          <div>
            <h1 className={styles.heroTitle}>{t("paymentMethods.title")}</h1>
            <p className={styles.heroSub}>{t("paymentMethods.subtitle")}</p>
          </div>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => startSetup("card")}
            >
              {t("paymentMethods.addCard")}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => launchPlaid()}
              disabled={plaidLaunching}
            >
              {plaidLaunching
                ? t("paymentMethods.linkingBank")
                : t("paymentMethods.linkBank")}
            </button>
            {onGoToBills ? (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={onGoToBills}
              >
                {t("paymentMethods.backToBills")}
              </button>
            ) : (
              showBillPaymentsLink && (
                <Link href="/bill-payments" className={styles.btnSecondary}>
                  {t("paymentMethods.openBillPayments")}
                </Link>
              )
            )}
          </div>
        </section>
      )}

      {error && <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>}
      {notice && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>{notice}</div>
      )}

      {summary && (
        <div className={styles.metrics}>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>{t("paymentMethods.metrics.saved")}</div>
            <div className={styles.metricValue}>{summary.totalMethods}</div>
            <div className={styles.metricHint}>
              {summary.cardCount} {t("paymentMethods.metrics.cards")} ·{" "}
              {summary.bankCount} {t("paymentMethods.metrics.banks")}
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>
              {t("paymentMethods.metrics.payments90d")}
            </div>
            <div className={styles.metricValue}>
              {summary.paymentsLast90Days ?? 0}
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>
              {t("paymentMethods.metrics.volume90d")}
            </div>
            <div className={styles.metricValue}>
              {formatCurrency(summary.volumeLast90Days || 0)}
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricLabel}>
              {t("paymentMethods.metrics.successRate")}
            </div>
            <div className={styles.metricValue}>
              {summary.successRate != null ? `${summary.successRate}%` : "—"}
            </div>
          </div>
        </div>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>{t("paymentMethods.walletTitle")}</h2>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => startSetup("card")}
            >
              {t("paymentMethods.addCard")}
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => launchPlaid()}
              disabled={plaidLaunching}
            >
              {t("paymentMethods.linkBank")}
            </button>
          </div>
        </div>

        {setupIntentState.active &&
          setupIntentState.clientSecret &&
          stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: setupIntentState.clientSecret,
                business: { name: brandName },
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#0f766e",
                    borderRadius: "14px",
                  },
                },
              }}
            >
              <PaymentMethodSetupForm
                methodType={setupIntentState.methodType}
                billingDetails={{ name: billingName, email: billingEmail }}
                saving={saving}
                setSaving={setSaving}
                onCancel={() =>
                  setSetupIntentState({
                    active: false,
                    clientSecret: "",
                    methodType: "card",
                  })
                }
                onError={setError}
                onSaved={async (method) => {
                  setSetupIntentState({
                    active: false,
                    clientSecret: "",
                    methodType: "card",
                  });
                  setNotice(
                    t("paymentMethods.saved", {
                      label: formatPaymentMethodLabel(method),
                    }),
                  );
                  await loadData();
                }}
              />
            </Elements>
          )}

        {methods.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t("paymentMethods.emptyTitle")}</p>
            <p>{t("paymentMethods.emptyBody")}</p>
          </div>
        ) : (
          <div className={styles.methodGrid}>
            {methods.map((method) => {
              const expiry = formatExpiry(method);
              const usage = method.usage || {};
              return (
                <article
                  key={method.id}
                  className={`${styles.methodCard} ${
                    method.isDefault ? styles.methodCardDefault : ""
                  }`}
                >
                  <div className={styles.methodIcon}>
                    {paymentMethodIcon(method)}
                  </div>
                  <div>
                    <div className={styles.methodName}>
                      {formatPaymentMethodLabel(method)}
                      {method.isDefault && (
                        <span className={styles.badgeDefault} style={{ marginLeft: 8 }}>
                          {t("paymentMethods.default")}
                        </span>
                      )}
                    </div>
                    <div className={styles.methodMeta}>
                      {method.methodType === "card"
                        ? [method.brand, expiry].filter(Boolean).join(" · ")
                        : method.bankName || t("paymentMethods.bankAccount")}
                      {method.provider === "plaid" && " · Plaid"}
                    </div>
                    {usage.paymentCount > 0 && (
                      <div className={styles.methodStats}>
                        <span className={styles.statPill}>
                          {usage.paymentCount}{" "}
                          {t("paymentMethods.payments")}
                        </span>
                        <span className={styles.statPill}>
                          {formatCurrency(usage.volume || usage.paidVolume || 0)}
                        </span>
                        {usage.lastUsedAt && (
                          <span className={styles.statPill}>
                            {t("paymentMethods.lastUsed")}{" "}
                            {formatDate(usage.lastUsedAt)}
                          </span>
                        )}
                      </div>
                    )}
                    {method.provider === "plaid" && (
                      <div className={`${styles.alert} ${styles.alertWarn}`} style={{ marginTop: 10 }}>
                        {t("paymentMethods.plaidNote")}
                      </div>
                    )}
                  </div>
                  <div className={styles.methodActions}>
                    {!method.isDefault && method.provider !== "plaid" && (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => markDefault(method.id)}
                      >
                        {t("paymentMethods.makeDefault")}
                      </button>
                    )}
                    {method.provider === "plaid" && (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => launchPlaid(method)}
                        disabled={plaidLaunching}
                      >
                        {t("paymentMethods.reconnect")}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={() => removeMethod(method.id)}
                    >
                      {t("paymentMethods.remove")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {!compact && recentActivity.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t("paymentMethods.recentActivity")}</h2>
          <div className={styles.activityList}>
            {recentActivity.map((row) => {
              const method = methods.find((m) => m.id === row.paymentMethodId);
              return (
                <div key={row.id} className={styles.activityRow}>
                  <div>
                    <strong>{row.providerName || t("paymentMethods.payment")}</strong>
                    <div className={styles.methodMeta}>
                      {formatPaymentMethodLabel(method)} · {formatDate(row.processedAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>
                      {formatCurrency(row.amount)}
                    </div>
                    <div className={styles.methodMeta}>{row.status}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {defaultMethod && !compact && (
        <p className={styles.methodMeta}>
          {t("paymentMethods.defaultHint", {
            label: formatPaymentMethodLabel(defaultMethod),
          })}
        </p>
      )}
    </div>
  );
}
