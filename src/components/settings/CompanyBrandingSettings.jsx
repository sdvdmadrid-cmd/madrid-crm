"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import CompanyLogoPanel from "@/components/website-builder/CompanyLogoPanel";
import { WEBSITE_BUILDER_UI } from "@/components/website-builder/website-builder-ui";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import ws from "@/styles/workspace-dark.module.css";
import styles from "./company-branding.module.css";

const EMPTY_PROFILE = {
  companyName: "",
  publicDisplayName: "",
  phone: "",
  businessAddress: "",
  websiteUrl: "",
  logoUrl: "",
  logoPlacement: "top-left",
  publishedSiteUrl: "",
  documentWebsiteUrl: "",
};

export default function CompanyBrandingSettings() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("es")
    ? "es"
    : i18n.language?.startsWith("pl")
      ? "pl"
      : "en";
  const wb = WEBSITE_BUILDER_UI[lang] || WEBSITE_BUILDER_UI.en;
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");
  const savedTimerRef = useRef(null);
  const actionsRef = useRef(null);

  const clearSavedTimer = () => {
    if (savedTimerRef.current) {
      window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
  };

  useEffect(() => () => clearSavedTimer(), []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/company-profile");
      const payload = await getJsonOrThrow(res, t("companyBranding.errors.load"));
      setProfile({ ...EMPTY_PROFILE, ...(payload?.data || {}) });
    } catch (err) {
      setError(err.message || t("companyBranding.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const markDirty = () => {
    clearSavedTimer();
    setSaveState("idle");
    setError("");
  };

  const updateProfile = (updater) => {
    markDirty();
    setProfile((prev) => (typeof updater === "function" ? updater(prev) : updater));
  };

  const showSavedFeedback = () => {
    setSaveState("saved");
    clearSavedTimer();
    savedTimerRef.current = window.setTimeout(() => {
      setSaveState("idle");
      savedTimerRef.current = null;
    }, 3500);
    actionsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const handleLogoChange = ({ logoUrl, logoPlacement }) => {
    setProfile((prev) => ({
      ...prev,
      logoUrl: logoUrl ?? prev.logoUrl,
      logoPlacement: logoPlacement ?? prev.logoPlacement,
    }));
    showSavedFeedback();
  };

  const saveProfile = async () => {
    setSaveState("saving");
    setError("");
    clearSavedTimer();
    try {
      const res = await apiFetch("/api/company-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: profile.companyName,
          publicDisplayName: profile.publicDisplayName || profile.companyName,
          phone: profile.phone,
          businessAddress: profile.businessAddress,
          websiteUrl: profile.websiteUrl,
          logoUrl: profile.logoUrl,
          logoPlacement: profile.logoPlacement,
        }),
      });
      const payload = await getJsonOrThrow(res, t("companyBranding.errors.save"));
      setProfile({ ...EMPTY_PROFILE, ...(payload?.data || {}) });
      showSavedFeedback();
    } catch (err) {
      setSaveState("error");
      setError(err.message || t("companyBranding.errors.save"));
      actionsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const displayName =
    String(profile.publicDisplayName || profile.companyName || "").trim() ||
    t("companyBranding.preview.unnamed");

  const saveButtonLabel =
    saveState === "saving"
      ? t("settings.savingSettings")
      : saveState === "saved"
        ? t("companyBranding.savedButton")
        : t("settings.saveSettings");

  return (
    <PremiumPageShell
      title={t("companyBranding.title")}
      subtitle={t("companyBranding.subtitle")}
      actions={
        <Link href="/settings" className={ws.btnSecondary}>
          {t("companyBranding.backToSettings")}
        </Link>
      }
    >
      {loading ? (
        <p className={ws.subtitle}>{t("companyBranding.loading")}</p>
      ) : (
        <div className={styles.layout}>
          <CompanyLogoPanel
            t={wb}
            logoUrl={profile.logoUrl || ""}
            logoPlacement={profile.logoPlacement || "top-left"}
            companyProfile={profile}
            onChange={handleLogoChange}
          />

          <section className={styles.websiteSyncCard}>
            <h2 className={styles.sectionTitle}>
              {t("companyBranding.websiteSync.title")}
            </h2>
            <p className={styles.sectionHint}>
              {t("companyBranding.websiteSync.body")}
            </p>
            <div className={styles.websiteSyncActions}>
              <Link href="/website-builder" className={ws.btnSecondary}>
                {t("companyBranding.websiteSync.openBuilder")}
              </Link>
              {profile.publishedSiteUrl ? (
                <a
                  href={profile.publishedSiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ws.btnSecondary}
                >
                  {t("companyBranding.websiteSync.viewLive")}
                </a>
              ) : null}
            </div>
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.sectionTitle}>
              {t("companyBranding.sections.contact")}
            </h2>
            <p className={styles.sectionHint}>
              {t("companyBranding.sections.contactHint")}
            </p>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>{t("settings.companyNameLabel")}</span>
                <input
                  className={styles.input}
                  value={profile.companyName || ""}
                  onChange={(e) =>
                    updateProfile((prev) => ({ ...prev, companyName: e.target.value }))
                  }
                  placeholder={t("companyBranding.placeholders.companyName")}
                />
              </label>
              <label className={styles.field}>
                <span>{t("companyBranding.labels.displayName")}</span>
                <input
                  className={styles.input}
                  value={profile.publicDisplayName || ""}
                  onChange={(e) =>
                    updateProfile((prev) => ({
                      ...prev,
                      publicDisplayName: e.target.value,
                    }))
                  }
                  placeholder={t("companyBranding.placeholders.displayName")}
                />
              </label>
              <label className={styles.field}>
                <span>{t("settings.phoneLabel")}</span>
                <input
                  className={styles.input}
                  value={profile.phone || ""}
                  onChange={(e) =>
                    updateProfile((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="(555) 123-4567"
                />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>{t("settings.businessAddressLabel")}</span>
                <input
                  className={styles.input}
                  value={profile.businessAddress || ""}
                  onChange={(e) =>
                    updateProfile((prev) => ({
                      ...prev,
                      businessAddress: e.target.value,
                    }))
                  }
                  placeholder={t("companyBranding.placeholders.address")}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>{t("companyBranding.labels.website")}</span>
                <input
                  className={styles.input}
                  value={profile.websiteUrl || ""}
                  onChange={(e) =>
                    updateProfile((prev) => ({ ...prev, websiteUrl: e.target.value }))
                  }
                  placeholder={t("settings.websiteUrlPlaceholder")}
                />
                <span className={styles.fieldNote}>
                  {t("companyBranding.labels.websiteHint")}
                </span>
              </label>
            </div>

            <div className={styles.previewBox} data-testid="company-branding-preview">
              <p className={styles.previewTitle}>
                {t("companyBranding.preview.title")}
              </p>
              <div className={styles.previewRow}>
                {profile.logoUrl ? (
                  <img
                    src={profile.logoUrl}
                    alt=""
                    className={styles.previewLogo}
                  />
                ) : (
                  <div className={styles.previewLogoPlaceholder}>
                    {t("companyBranding.preview.noLogo")}
                  </div>
                )}
                <div>
                  <strong className={styles.previewName}>{displayName}</strong>
                  {profile.phone ? (
                    <p className={styles.previewLine}>{profile.phone}</p>
                  ) : null}
                  {profile.businessAddress ? (
                    <p className={styles.previewLine}>{profile.businessAddress}</p>
                  ) : null}
                  <p className={styles.previewLine}>
                    {profile.documentWebsiteUrl ||
                      profile.publishedSiteUrl ||
                      t("companyBranding.preview.defaultSite")}
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.actions} ref={actionsRef}>
              {error ? (
                <p className={styles.saveError} role="alert">
                  {error}
                </p>
              ) : null}
              {saveState === "saved" ? (
                <p className={styles.saveSuccess} role="status">
                  {t("companyBranding.saved")}
                </p>
              ) : null}
              <button
                type="button"
                className={`${ws.btnPrimary} ${
                  saveState === "saved" ? styles.saveBtnSuccess : ""
                }`}
                onClick={saveProfile}
                disabled={saveState === "saving"}
                data-testid="company-branding-save"
              >
                {saveButtonLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </PremiumPageShell>
  );
}
