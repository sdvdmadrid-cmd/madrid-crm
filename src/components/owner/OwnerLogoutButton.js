"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
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
  const router = useRouter();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        suppressUnauthorizedEvent: true,
      });
    } catch {
      // Still clear client state when the API is unreachable.
    }

    try {
      await supabase.auth.signOut();
    } catch {
      // Cookie logout is authoritative; Supabase sign-out is best-effort.
    }

    clearOwnerClientState();
    router.replace("/login");
    router.refresh();
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
