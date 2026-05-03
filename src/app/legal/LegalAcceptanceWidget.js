"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";

export default function LegalAcceptanceWidget() {
  const { t } = useTranslation();
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [legalVersion, setLegalVersion] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Check auth status
    apiFetch("/api/auth/me", { suppressUnauthorizedEvent: true })
      .then((res) => {
        if (!res.ok) {
          setIsLoggedIn(false);
          setAuthChecked(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const user = data?.data;
        setIsLoggedIn(!!user);
        setAuthChecked(true);

        if (user) {
          // Fetch current legal version
          apiFetch("/api/legal/version", { suppressUnauthorizedEvent: true })
            .then((r) => r.json())
            .then((d) => {
              const v = String(d?.data?.version || "").trim();
              if (v) setLegalVersion(v);
            })
            .catch(() => {});

          // Check if already accepted
          apiFetch("/api/legal/status", { suppressUnauthorizedEvent: true })
            .then((r) => r.json())
            .then((d) => {
              if (d?.data?.accepted) setAlreadyAccepted(true);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        setIsLoggedIn(false);
        setAuthChecked(true);
      });
  }, []);

  const handleAccept = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await apiFetch("/api/legal/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: legalVersion || undefined }),
        suppressUnauthorizedEvent: true,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Failed to record acceptance. Please try again.");
        setSubmitting(false);
        return;
      }

      setAccepted(true);
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1200);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (!authChecked) return null;

  if (alreadyAccepted || accepted) {
    return (
      <div className="mt-10 rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-green-800 font-medium">
          {accepted
            ? t("legal.acceptance.accepted")
            : "✓ Terms already accepted — you're all set."}
        </p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="text-amber-800 font-medium mb-3">
          {t("legal.acceptance.signInToAccept")}
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          {t("legal.acceptance.signInLink")} →
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-xl border border-blue-200 bg-blue-50 p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        {t("legal.acceptance.heading")}
      </h2>
      <p className="text-xs text-gray-500 mb-5">
        {t("legal.acceptance.complianceNote")}
      </p>

      <label className="flex items-start gap-3 cursor-pointer mb-5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">
          {t("legal.acceptance.checkbox")}
        </span>
      </label>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      <button
        type="button"
        disabled={!checked || submitting}
        onClick={handleAccept}
        className="w-full sm:w-auto rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting
          ? t("legal.acceptance.submitting")
          : t("legal.acceptance.submit")}
      </button>
    </div>
  );
}
