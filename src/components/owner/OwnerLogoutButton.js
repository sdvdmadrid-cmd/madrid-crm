"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import { markClientLoggedOut } from "@/lib/auth-logout-guard.js";
import { performAuthHardNavigate } from "@/lib/auth-nav";
import { supabase } from "@/lib/supabase";
import styles from "./OwnerShell.module.css";

function clearOwnerClientState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("user-industry");
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("auth:logout"));
}

export default function OwnerLogoutButton({ variant = "sidebar" }) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  function handleLogout() {
    if (submitting) return;
    setSubmitting(true);

    clearOwnerClientState();
    markClientLoggedOut();

    void apiFetch("/api/auth/logout", {
      method: "POST",
      suppressUnauthorizedEvent: true,
    }).catch(() => {});
    void supabase.auth.signOut().catch(() => {});

    performAuthHardNavigate("/login");
  }

  const className =
    variant === "header" ? styles.ownerHeaderLogout : styles.ownerLogoutBtn;

  return (
    <button
      type="button"
      className={className}
      onClick={handleLogout}
      disabled={submitting}
      aria-label={t("ownerNav.logout")}
    >
      <span className={styles.ownerLogoutIcon} aria-hidden>
        ⎋
      </span>
      {submitting ? t("ownerNav.signingOut") : t("ownerNav.logout")}
    </button>
  );
}
