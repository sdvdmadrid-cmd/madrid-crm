"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import { EXPIRED_TRIAL_SUBSCRIBE_PATH } from "@/lib/subscription-routes";
import styles from "./subscriptions.module.css";

function SubscriptionsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [creatingSubscription, setCreatingSubscription] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [openingBillingPortal, setOpeningBillingPortal] = useState(false);
  const planDisplay = {
    title: "FieldBase subscription",
    price: "$35/month",
    trial: "15-day free trial on signup",
    cta: "Subscribe now",
    creating: "Starting checkout…",
  };

  const fetchSubscriptionData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [subRes, invRes] = await Promise.all([
        apiFetch("/api/subscriptions/current"),
        apiFetch("/api/subscriptions/invoices"),
      ]);

      const subData = await getJsonOrThrow(subRes, "Failed to fetch subscription");
      const invData = await getJsonOrThrow(invRes, "Failed to fetch billing history");

      setSubscription(subData.subscription);
      setInvoices(invData.invoices || []);
    } catch (err) {
      console.error("Error fetching subscription data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("trial_expired") === "1") {
      router.replace(EXPIRED_TRIAL_SUBSCRIBE_PATH);
    }
  }, [router, searchParams]);

  useEffect(() => {
    fetchSubscriptionData();
  }, [fetchSubscriptionData]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      setNotice("Subscription checkout completed. Your access will update shortly.");
    } else if (checkout === "cancelled") {
      setError("Checkout was cancelled. You can try again when you are ready.");
    }
  }, [searchParams]);

  const handleStartCheckout = useCallback(async () => {
    try {
      setStartingCheckout(true);
      setError(null);
      setNotice(null);

      const res = await apiFetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "app" }),
      });
      const data = await getJsonOrThrow(res, "Failed to start checkout");
      const redirectUrl = String(data.url || "").trim();
      if (!redirectUrl) {
        throw new Error("Stripe did not return a checkout URL");
      }
      window.location.assign(redirectUrl);
    } catch (err) {
      console.error("Error starting checkout:", err);
      setError(err.message || "Unable to start checkout");
    } finally {
      setStartingCheckout(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (searchParams.get("subscribe") !== "1") return;
    if (subscription) return;
    handleStartCheckout();
  }, [loading, searchParams, subscription, handleStartCheckout]);

  async function handleCancelSubscription() {
    if (!confirm("Are you sure you want to cancel your subscription?")) {
      return;
    }

    try {
      setCancellingSubscription(true);
      setError(null);

      const res = await apiFetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await getJsonOrThrow(res, "Failed to cancel subscription");

      await fetchSubscriptionData();
    } catch (err) {
      console.error("Error cancelling subscription:", err);
      setError(err.message);
    } finally {
      setCancellingSubscription(false);
    }
  }

  async function handleManageBilling() {
    try {
      setOpeningBillingPortal(true);
      setError(null);

      const res = await apiFetch("/api/subscriptions/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "app" }),
      });
      const data = await getJsonOrThrow(res, "Failed to open billing setup");

      const redirectUrl = String(data.url || "").trim();
      if (!redirectUrl) {
        throw new Error("Missing billing portal URL");
      }

      window.location.assign(redirectUrl);
    } catch (err) {
      console.error("Error opening billing portal:", err);
      setError(err.message);
    } finally {
      setOpeningBillingPortal(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  function getStatusBadge(status) {
    const statusMap = {
      trialing: { label: "Trial", color: "info" },
      active: { label: "Active", color: "success" },
      paused: { label: "Paused", color: "warning" },
      past_due: { label: "Past due", color: "danger" },
      cancelled: { label: "Cancelled", color: "secondary" },
    };
    const info = statusMap[status] || { label: status, color: "secondary" };
    return info;
  }

  if (loading) {
    return (
      <PremiumPageShell title={planDisplay.title} subtitle="Loading subscription…">
        <div className={`fb-shimmer ${styles.loadingCard}`} data-testid="subscriptions-loading">
          Loading subscription…
        </div>
      </PremiumPageShell>
    );
  }

  const isComplimentary = subscription?.complimentary === true;
  const statusInfo = subscription
    ? getStatusBadge(isComplimentary ? "active" : subscription.status)
    : null;
  const trialEndsAt = subscription?.trialEndsAt
    ? new Date(subscription.trialEndsAt)
    : null;
  const daysUntilTrialEnds =
    trialEndsAt && subscription?.status === "trialing"
      ? Math.ceil((trialEndsAt - new Date()) / (1000 * 60 * 60 * 24))
      : null;

  return (
    <PremiumPageShell
      title={planDisplay.title}
      subtitle="Manage your FieldBase plan, trial, and billing history."
      actions={
        <Link href="/settings" className={styles.backButton} data-testid="subscriptions-back-settings">
          ← All settings
        </Link>
      }
    >
        <div data-testid="subscriptions-page">
        {error && <div className={styles.errorBanner}>{error}</div>}
        {notice && <div className={styles.successBanner}>{notice}</div>}

        {isComplimentary && (
          <div className={styles.card} style={{ marginBottom: "1rem" }}>
            <p>
              <strong>Cuenta del propietario de la plataforma.</strong> Madrid
              Landscaping tiene acceso completo y gratuito de por vida. No
              necesitas activar ni pagar la suscripción SaaS de FieldBase.
            </p>
          </div>
        )}

        {!subscription ? (
          <div className={styles.card}>
            <div className={styles.noSubscriptionContent}>
              <h2>No active subscription</h2>
              <p>
                Subscribe for <strong>{planDisplay.price}</strong> to restore full access to
                clients, jobs, estimates, invoices, payroll, and calendar.
              </p>

              <div className={styles.features}>
                <h3>Includes:</h3>
                <ul>
                  <li>Clients, jobs, and estimates</li>
                  <li>Invoices with online payment links (Stripe)</li>
                  <li>Payroll and calendar</li>
                  <li>Priority support</li>
                </ul>
              </div>

              <button
                className={styles.buttonPrimary}
                onClick={handleStartCheckout}
                disabled={startingCheckout || creatingSubscription}
                data-testid="subscriptions-start-checkout"
              >
                {startingCheckout || creatingSubscription
                  ? planDisplay.creating
                  : planDisplay.cta}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.subscriptionGrid}>
            {/* Current Subscription Card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Tu Suscripción Activa</h2>
                <span
                  className={`${styles.badge} ${styles[`badge-${statusInfo.color}`]}`}
                >
                  {statusInfo.label}
                </span>
              </div>

              <div className={styles.subscriptionDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.label}>Plan:</span>
                  <span className={styles.value}>{subscription.planName}</span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.label}>Precio:</span>
                  <span className={styles.value}>
                    {formatCurrency(subscription.priceMonthly)}/mes
                  </span>
                </div>

                {daysUntilTrialEnds && daysUntilTrialEnds > 0 && (
                  <div className={styles.detailRow}>
                    <span className={styles.label}>Período de prueba:</span>
                    <span className={styles.value}>
                      {daysUntilTrialEnds} días restantes
                    </span>
                  </div>
                )}

                {subscription.status === "trialing" ? (
                  <div className={styles.detailRow}>
                    <span className={styles.label}>Estado de facturación:</span>
                    <span className={styles.value}>
                      Pendiente de método de pago.
                    </span>
                  </div>
                ) : null}

                {subscription.status !== "trialing" ? (
                  <div className={styles.detailRow}>
                    <span className={styles.label}>Estado de facturación:</span>
                    <span className={styles.value}>Método de pago configurado.</span>
                  </div>
                ) : null}

                {subscription.currentPeriodStart && (
                  <div className={styles.detailRow}>
                    <span className={styles.label}>Período actual:</span>
                    <span className={styles.value}>
                      {formatDate(subscription.currentPeriodStart)} a{" "}
                      {formatDate(subscription.currentPeriodEnd)}
                    </span>
                  </div>
                )}

                <div className={styles.detailRow}>
                  <span className={styles.label}>Suscrito desde:</span>
                  <span className={styles.value}>
                    {formatDate(subscription.createdAt)}
                  </span>
                </div>
              </div>

              {subscription.status !== "cancelled" && !isComplimentary && (
                <>
                  <button
                    className={styles.buttonPrimary}
                    onClick={handleManageBilling}
                    disabled={openingBillingPortal}
                  >
                    {openingBillingPortal
                      ? "Abriendo pago..."
                      : subscription.status === "trialing"
                        ? "Activar Suscripción"
                        : "Gestionar método de pago"}
                  </button>

                  <button
                    className={styles.buttonDanger}
                    onClick={handleCancelSubscription}
                    disabled={cancellingSubscription}
                  >
                    {cancellingSubscription
                      ? "Cancelando..."
                      : "Cancelar suscripción"}
                  </button>
                </>
              )}
            </div>

            {/* Invoices Card */}
            <div className={styles.card}>
              <h2>Historial de Facturas</h2>

              {invoices.length === 0 ? (
                <p className={styles.emptyState}>
                  No hay facturas disponibles aún.
                </p>
              ) : (
                <div className={styles.invoicesList}>
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className={styles.invoiceRow}>
                      <div className={styles.invoiceInfo}>
                        <div className={styles.invoiceDate}>
                          {formatDate(invoice.createdAt)}
                        </div>
                        <div className={styles.invoicePeriod}>
                          Período:{" "}
                          {formatDate(invoice.periodStart)} a{" "}
                          {formatDate(invoice.periodEnd)}
                        </div>
                      </div>
                      <div className={styles.invoiceAmount}>
                        {formatCurrency(invoice.amount)}
                      </div>
                      <span
                        className={`${styles.badge} ${styles[`badge-${invoice.status === "paid" ? "success" : "warning"}`]}`}
                      >
                        {invoice.status === "paid" ? "Pagado" : "Pendiente"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
    </PremiumPageShell>
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense
      fallback={
        <PremiumPageShell title="FieldBase subscription" subtitle="Loading subscription…">
          <div className={`fb-shimmer ${styles.loadingCard}`}>Loading subscription…</div>
        </PremiumPageShell>
      }
    >
      <SubscriptionsPageInner />
    </Suspense>
  );
}
