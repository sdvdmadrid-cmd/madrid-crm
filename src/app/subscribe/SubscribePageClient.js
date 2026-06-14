"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { markClientLoggedOut } from "@/lib/auth-logout-guard.js";
import {
  clearAuthNavAttempt,
  performAuthHardNavigate,
  recordAuthNavAttempt,
  shouldSkipAuthRedirect,
} from "@/lib/auth-nav";
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
  const router = useRouter();
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [activatingAccess, setActivatingAccess] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const mountedRef = useRef(false);
  const restoreAttemptedRef = useRef(false);

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

  const redirectToDashboard = useCallback(() => {
    if (shouldSkipAuthRedirect("/dashboard")) {
      console.warn("[subscribe] skipping auto-redirect — recent navigation loop detected");
      return false;
    }
    recordAuthNavAttempt("/dashboard");
    router.replace("/dashboard");
    return true;
  }, [router]);

  const restoreExistingAccess = useCallback(async () => {
    try {
      const reconcileRes = await withTimeout(
        apiFetch("/api/subscriptions/reconcile", { method: "POST", cache: "no-store" }),
        PLAN_LOAD_TIMEOUT_MS,
      );
      if (reconcileRes.ok) {
        const reconcilePayload = await reconcileRes.json();
        if (reconcilePayload?.data?.hasBusinessAccess) {
          clearAuthNavAttempt();
          redirectToDashboard();
          return true;
        }
      }

      const res = await withTimeout(
        apiFetch("/api/auth/me", { cache: "no-store", timeoutMs: PLAN_LOAD_TIMEOUT_MS }),
        PLAN_LOAD_TIMEOUT_MS,
      );
      if (!res.ok) return false;
      const payload = await res.json();
      const data = payload?.data || {};
      const stripeStatus = String(data.stripeSubscriptionStatus || "").toLowerCase();
      const paidActive =
        data.hasBusinessAccess === true &&
        (data.isSubscribed === true ||
          stripeStatus === "active" ||
          stripeStatus === "trialing" ||
          data.complimentaryAccess === true);
      if (paidActive) {
        console.log("Access granted");
        clearAuthNavAttempt();
        redirectToDashboard();
        return true;
      }
    } catch (err) {
      console.warn("[subscribe] restore access failed:", err?.message || err);
    }
    return false;
  }, [redirectToDashboard]);

  const activateAfterCheckout = useCallback(async () => {
    setActivatingAccess(true);
    setError("");
    setSuccessNotice("Payment received. Activating your subscription…");

    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        if (attempt === 0 || attempt % 2 === 0) {
          const reconcileRes = await withTimeout(
            apiFetch("/api/subscriptions/reconcile", {
              method: "POST",
              cache: "no-store",
            }),
            PLAN_LOAD_TIMEOUT_MS,
          );
          if (reconcileRes.ok) {
            const reconcilePayload = await reconcileRes.json();
            if (reconcilePayload?.data?.hasBusinessAccess) {
              console.log("Access granted via Stripe reconcile");
              setSuccessNotice("Subscription active. Redirecting to your workspace…");
              clearAuthNavAttempt();
              redirectToDashboard();
              return;
            }
          }
        }

        const res = await withTimeout(
          apiFetch("/api/auth/me", { cache: "no-store" }),
          PLAN_LOAD_TIMEOUT_MS,
        );
        if (res.ok) {
          const payload = await res.json();
          const data = payload?.data || {};
          if (data.hasBusinessAccess) {
            console.log("Access granted");
            setSuccessNotice("Subscription active. Redirecting to your workspace…");
            clearAuthNavAttempt();
            redirectToDashboard();
            return;
          }
        }
      } catch (err) {
        console.warn("[subscribe] activation poll failed:", err?.message || err);
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    setActivatingAccess(false);
    setSuccessNotice("");
    setError(
      "Payment received. Access is still syncing — click Retry activation or refresh in a moment.",
    );
  }, [redirectToDashboard]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    console.log("Subscribe page mounted");

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("checkout") === "cancelled") {
        setError("Checkout was cancelled. You can try again when you are ready.");
        window.history.replaceState({}, "", "/subscribe");
      } else if (params.get("checkout") === "success") {
        window.history.replaceState({}, "", "/subscribe");
        void activateAfterCheckout();
      } else if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
        void restoreExistingAccess();
      }
    } else {
      void restoreExistingAccess();
    }

    void loadPlans();
  }, [loadPlans, activateAfterCheckout, restoreExistingAccess]);

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

        {successNotice ? <div className={styles.planNotice}>{successNotice}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSubscribeNow}
            disabled={startingCheckout || loggingOut || plansLoading || activatingAccess}
            data-testid="subscribe-now-btn"
          >
            {startingCheckout ? "Opening checkout…" : "Subscribe Now"}
          </button>
          {error ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                if (!activatingAccess) void activateAfterCheckout();
              }}
              disabled={startingCheckout || loggingOut || activatingAccess}
              data-testid="subscribe-retry-activation-btn"
            >
              {activatingAccess ? "Activating…" : "Retry activation"}
            </button>
          ) : null}
          {error ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleSubscribeNow}
              disabled={startingCheckout || loggingOut || activatingAccess}
              data-testid="subscribe-retry-btn"
            >
              Retry checkout
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
