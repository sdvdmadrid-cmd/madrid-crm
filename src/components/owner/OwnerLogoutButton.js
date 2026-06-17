"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { performClientLogout } from "@/lib/auth-logout-client";
import styles from "./OwnerShell.module.css";

export default function OwnerLogoutButton({ variant = "sidebar" }) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  function handleLogout() {
    if (submitting) return;
    setSubmitting(true);
    void performClientLogout();
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
      data-testid={variant === "header" ? "owner-logout-header-btn" : "owner-logout-sidebar-btn"}
    >
      <span className={styles.ownerLogoutIcon} aria-hidden>
        ⎋
      </span>
      {submitting ? t("ownerNav.signingOut") : t("ownerNav.logout")}
    </button>
  );
}
