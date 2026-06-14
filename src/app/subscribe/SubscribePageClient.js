"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { markClientLoggedOut } from "@/lib/auth-logout-guard.js";
import { performAuthHardNavigate } from "@/lib/auth-nav";
import { supabase } from "@/lib/supabase";
import styles from "./subscribe.module.css";

const PLAN_LOAD_TIMEOUT_MS = 8_000;
const DEFAULT_PLAN = {
  name: "Contractor Pro",
  priceMonthly: 35,
  features: [
    "Clients, jobs, and estimates",
    "Invoices with online payment links (Stripe)",
    "Payroll and calendar",
    "Priority support",
  ],
};

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out")), ms);
    }),
  ]);
}

export default function SubscribePageClient() {
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const mountedRef = useRef(false);

  const loadPlans = useCallback(async () => {
    console.log("Loading plans...");
    setPlansLoading(true);
    setPlansError("");

    try {
      const res = await withTimeout(
        apiFetch("/api/subscriptions/current", { cache: "no-store" }),
        PLAN_LOAD_TIMEOUT_MS,
      );

      if (!res.ok) {
        throw new Error(`Unable to load plan details (${res.status})`);
      }

      const payload = await res.json();
      const sub = payload?.subscription;
      const loadedPlan = {
        name: sub?.planName || DEFAULT_PLAN.name,
        priceMonthly: Number(sub?.planName ? sub?.priceMonthly : DEFAULT_PLAN.priceMonthly) || DEFAULT_PLAN.priceMonthly,
        features: Array.isArray(sub?.features) && sub.features.length > 0
          ? sub.features
          : DEFAULT_PLAN.features,
      };
      setPlan(loadedPlan);
      console.log("Plans loaded:", loadedPlan);
    } catch (err) {
      console.warn("[subscribe] plan load failed, using fallback:", err?.message || err);
      setPlansError("Showing default plan — billing details will apply at checkout.");
      setPlan(DEFAULT_PLAN);
      console.log("Plans loaded:", DEFAULT_PLAN);
    } finally {
      setPlansLoading(false);
      console.log("Subscription page render complete");
    }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    console.log("Subscribe page mounted");

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("checkout") === "cancelled") {
        setError("Checkout was cancelled. You can try again when you are ready.");
        window.history.replaceState({}, "", "/subscribe");
      }
    }

    void loadPlans();
  }, [loadPlans]);

  const handleSubscribeNow = useCallback(async () => {
    try {
      setStartingCheckout(true);
      setError(null);
      console.log("Stripe initialized");

      const res = await withTimeout(
        apiFetch("/api/subscriptions/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "expired_trial" }),
        }),
        PLAN_LOAD_TIMEOUT_MS,
      );
      const data = await getJsonOrThrow(res, "Failed to start checkout");
      const redirectUrl = String(data.url || "").trim();
      if (!redirectUrl) {
        throw new Error("Stripe did not return a checkout URL");
      }
      window.location.assign(redirectUrl);
    } catch (err) {
      console.error("[subscribe] checkout failed:", err);
      setError(err.message || "Unable to start checkout. Please try again.");
      setStartingCheckout(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (loggingOut) return;
    setLoggingOut(true);
    markClientLoggedOut();
    void apiFetch("/api/auth/logout", {
      method: "POST",
      suppressUnauthorizedEvent: true,
    }).catch(() => {});
    void supabase.auth.signOut().catch(() => {});
    performAuthHardNavigate("/login");
  }, [loggingOut]);

  const priceLabel = `$${plan.priceMonthly}/month`;

  return (
    <main className={styles.subscribePage} data-testid="subscribe-page">
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          ⏱
        </div>
        <h1 className={styles.title}>Trial Expired</h1>
        <p className={styles.message}>
          Your 15-day free trial has ended.
          <br />
          To continue using ContractorFlow, please choose a subscription plan.
        </p>

        <section className={styles.planCard} data-testid="subscribe-plan-card">
          {plansLoading ? (
            <p className={styles.planLoading}>Loading plans…</p>
          ) : (
            <>
              <h2 className={styles.planName}>{plan.name}</h2>
              <p className={styles.planPrice}>{priceLabel}</p>
              <ul className={styles.planFeatures}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </>
          )}
          {plansError ? <p className={styles.planNotice}>{plansError}</p> : null}
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSubscribeNow}
            disabled={startingCheckout || loggingOut || plansLoading}
            data-testid="subscribe-now-btn"
          >
            {startingCheckout ? "Opening checkout…" : "Subscribe Now"}
          </button>
          {error ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleSubscribeNow}
              disabled={startingCheckout || loggingOut}
              data-testid="subscribe-retry-btn"
            >
              Retry
            </button>
          ) : null}
          {!plansLoading && plansError ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void loadPlans()}
              disabled={plansLoading}
              data-testid="subscribe-reload-plans-btn"
            >
              Reload plans
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleLogout}
            disabled={startingCheckout || loggingOut}
            data-testid="subscribe-logout-btn"
          >
            {loggingOut ? "Signing out…" : "Logout"}
          </button>
        </div>
      </div>
    </main>
  );
}
