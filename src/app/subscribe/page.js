"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { markClientLoggedOut } from "@/lib/auth-logout-guard.js";
import { performAuthHardNavigate } from "@/lib/auth-nav";
import { supabase } from "@/lib/supabase";
import styles from "./subscribe.module.css";

export default function SubscribePage() {
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "cancelled") {
      setError("Checkout was cancelled. You can try again when you are ready.");
      window.history.replaceState({}, "", "/subscribe");
    }
  }, []);

  const handleSubscribeNow = useCallback(async () => {
    try {
      setStartingCheckout(true);
      setError(null);

      const res = await apiFetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "expired_trial" }),
      });
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

  const handleLogout = useCallback(async () => {
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

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSubscribeNow}
            disabled={startingCheckout || loggingOut}
            data-testid="subscribe-now-btn"
          >
            {startingCheckout ? "Opening checkout…" : "Subscribe Now"}
          </button>
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
