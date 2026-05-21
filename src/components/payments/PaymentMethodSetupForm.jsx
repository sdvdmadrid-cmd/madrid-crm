"use client";

import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useCallback } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import styles from "./PaymentMethodsHub.module.css";

export default function PaymentMethodSetupForm({
  methodType,
  billingDetails,
  onCancel,
  onSaved,
  onError,
  saving,
  setSaving,
}) {
  const stripe = useStripe();
  const elements = useElements();

  const submit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!stripe || !elements) return;

      setSaving(true);
      onError("");

      let result;
      try {
        result = await Promise.race([
          stripe.confirmSetup({
            elements,
            redirect: "if_required",
            confirmParams: {
              return_url:
                typeof window !== "undefined" ? window.location.href : undefined,
              payment_method_data: {
                billing_details: {
                  name: billingDetails?.name || "Cardholder",
                  email: billingDetails?.email || undefined,
                },
              },
            },
          }),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error("Stripe is taking too long. Please try again."));
            }, 30000);
          }),
        ]);
      } catch (error) {
        onError(error.message || "Unable to save payment method.");
        setSaving(false);
        return;
      }

      if (result.error) {
        onError(result.error.message || "Unable to save payment method.");
        setSaving(false);
        return;
      }

      const paymentMethodId = result.setupIntent?.payment_method;
      if (typeof paymentMethodId !== "string") {
        onError("Stripe did not return a payment method.");
        setSaving(false);
        return;
      }

      try {
        const syncResponse = await apiFetch(
          "/api/bill-payments/payment-methods/sync",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentMethodId, setDefault: false }),
            timeoutMs: 30000,
          },
        );
        const payload = await getJsonOrThrow(
          syncResponse,
          "Unable to sync saved payment method.",
        );
        onSaved(payload.data);
      } catch (error) {
        onError(error.message || "Unable to sync saved payment method.");
      } finally {
        setSaving(false);
      }
    },
    [
      billingDetails?.email,
      billingDetails?.name,
      elements,
      onError,
      onSaved,
      setSaving,
      stripe,
    ],
  );

  return (
    <form className={styles.setupForm} onSubmit={submit}>
      <div className={styles.stripeElementWrap}>
        <PaymentElement
          options={{
            layout: { type: "tabs", defaultCollapsed: false },
            fields: { billingDetails: "auto" },
            wallets: { applePay: "never", googlePay: "never" },
          }}
        />
      </div>
      <div className={styles.setupActions}>
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={!stripe || !elements || saving}
        >
          {saving
            ? "Saving…"
            : methodType === "bank_account"
              ? "Save bank account"
              : "Save card"}
        </button>
        <button type="button" className={styles.btnGhost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
