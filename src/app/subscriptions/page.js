"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import styles from "./subscriptions.module.css";

export default function SubscriptionsPage() {
  const router = useRouter();
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creatingSubscription, setCreatingSubscription] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [openingBillingPortal, setOpeningBillingPortal] = useState(false);
  const goBackPath = "/dashboard";
  const planDisplay = {
    title: "Suscripción",
    price: "$35 al mes",
    trial: "mes gratis como período de prueba",
    cta: "Comenzar período de prueba",
    creating: "Creando suscripción...",
  };

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  async function fetchSubscriptionData() {
    try {
      setLoading(true);
      setError(null);

      const [subRes, invRes] = await Promise.all([
        fetch("/api/subscriptions/current"),
        fetch("/api/subscriptions/invoices"),
      ]);

      if (!subRes.ok || !invRes.ok) {
        throw new Error("Failed to fetch subscription data");
      }

      const subData = await subRes.json();
      const invData = await invRes.json();

      setSubscription(subData.subscription);
      setInvoices(invData.invoices || []);
    } catch (err) {
      console.error("Error fetching subscription data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSubscription() {
    try {
      setCreatingSubscription(true);
      setError(null);

      const res = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "app",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create subscription");
      }

      await fetchSubscriptionData();
    } catch (err) {
      console.error("Error creating subscription:", err);
      setError(err.message);
    } finally {
      setCreatingSubscription(false);
    }
  }

  async function handleCancelSubscription() {
    if (!confirm("Are you sure you want to cancel your subscription?")) {
      return;
    }

    try {
      setCancellingSubscription(true);
      setError(null);

      const res = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel subscription");
      }

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

      const res = await fetch("/api/subscriptions/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "app",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to open billing setup");
      }

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
    return new Date(dateStr).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined) return "-";
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  function getStatusBadge(status) {
    const statusMap = {
      trialing: { label: "En período de prueba", color: "info" },
      active: { label: "Activo", color: "success" },
      paused: { label: "Pausado", color: "warning" },
      past_due: { label: "Vencido", color: "danger" },
      cancelled: { label: "Cancelado", color: "secondary" },
    };
    const info = statusMap[status] || { label: status, color: "secondary" };
    return info;
  }

  if (loading) {
    return (
      <PremiumPageShell title={planDisplay.title} subtitle="Cargando suscripción…">
        <div className={`fb-shimmer ${styles.loadingCard}`}>Cargando suscripción...</div>
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
      subtitle="Gestiona tu suscripción a la plataforma"
      actions={
        <button
          type="button"
          className={styles.backButton}
          onClick={() => router.push(goBackPath)}
        >
          ← Volver
        </button>
      }
    >
        {error && <div className={styles.errorBanner}>{error}</div>}

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
              <h2>No tienes una suscripción activa</h2>
              <p>
                Suscríbete hoy por <strong>{planDisplay.price}</strong> y disfruta de{" "}
                <strong>{planDisplay.trial}</strong>.
              </p>

              <div className={styles.features}>
                <h3>Incluye:</h3>
                <ul>
                  <li>Clientes, trabajos y estimados</li>
                  <li>Facturas con enlace de pago en línea (Stripe)</li>
                  <li>Envío de facturas por email</li>
                  <li>Registro de pagos en efectivo, cheque o transferencia</li>
                  <li>Soporte prioritario</li>
                </ul>
              </div>

              <button
                className={styles.buttonPrimary}
                onClick={handleCreateSubscription}
                disabled={creatingSubscription}
              >
                {creatingSubscription
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
    </PremiumPageShell>
  );
}
