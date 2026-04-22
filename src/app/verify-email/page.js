"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n";

const ERROR_KEYS = {
  expired_token: "auth.verificationExpired",
  invalid_token: "auth.verificationInvalid",
  missing_token: "auth.verificationMissing",
};

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorParam = searchParams.get("error");

  const [state, setState] = useState("idle"); // idle | verifying | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (errorParam) {
      setState("error");
      setErrorMessage(t(ERROR_KEYS[errorParam] || "auth.verificationFailed"));
      return;
    }
    if (token) {
      setState("verifying");
      // Route through the app router so verification transitions do not force
      // a hard browser navigation.
      router.replace(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorParam, router, t, token]);

  const handleResend = async () => {
    if (!resendEmail || resending) return;
    setResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      setResendDone(true);
    } catch {
      // silent — always show success to avoid leaking email existence
      setResendDone(true);
    } finally {
      setResending(false);
    }
  };

  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f4f5f7",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "24px",
  };

  const cardStyle = {
    background: "#fff",
    borderRadius: 14,
    boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
    padding: "40px 36px",
    maxWidth: 420,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  };

  const iconStyle = {
    width: 56,
    height: 56,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  };

  if (state === "idle") {
    // No token and no error: generic "check your email" landing
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ ...iconStyle, background: "#dcfce7" }}>
            <svg
              width={28}
              height={28}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#16a34a"
              strokeWidth={2}
              role="img"
              aria-label="Email icon"
            >
              <path d="M4 4h16v16H4z" rx="2" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: "#0f172a",
              textAlign: "center",
            }}
          >
            {t("verifyEmail.checkEmail")}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "#6b7280",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            {t("verifyEmail.checkEmailDesc")}
          </p>
          <a
            href="/"
            style={{
              marginTop: 8,
              fontSize: 14,
              color: "#16a34a",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            ← {t("verifyEmail.backToSignIn")}
          </a>
        </div>
      </div>
    );
  }

  if (state === "verifying") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ ...iconStyle, background: "#f0fdf4" }}>
            <svg
              width={28}
              height={28}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#16a34a"
              strokeWidth={2}
              role="img"
              aria-label="Loading icon"
              style={{ animation: "spin 1s linear infinite" }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            {t("verifyEmail.verifying")}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            {t("verifyEmail.verifyingDesc")}
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ ...iconStyle, background: "#fef2f2" }}>
            <svg
              width={28}
              height={28}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth={2}
              role="img"
              aria-label="Error icon"
            >
              <circle cx={12} cy={12} r={10} />
              <line x1={12} y1={8} x2={12} y2={12} />
              <line x1={12} y1={16} x2="12.01" y2={16} />
            </svg>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: "#0f172a",
              textAlign: "center",
            }}
          >
            {t("verifyEmail.linkInvalid")}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "#6b7280",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            {errorMessage}
          </p>

          {resendDone
            ? <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: "#16a34a",
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                {t("auth.verificationSentNew")}
              </p>
            : <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "#374151",
                    fontWeight: 500,
                  }}
                >
                  {t("verifyEmail.resendPrompt")}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    placeholder={t("auth.emailPlaceholder")}
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleResend()}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1.5px solid #d1d5db",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || !resendEmail}
                    style={{
                      padding: "9px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "#16a34a",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor:
                        resending || !resendEmail ? "not-allowed" : "pointer",
                      opacity: resending || !resendEmail ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {resending
                      ? t("auth.sending")
                      : t("auth.resendVerification")}
                  </button>
                </div>
              </div>}

          <a
            href="/"
            style={{ fontSize: 14, color: "#6b7280", textDecoration: "none" }}
          >
            ← {t("verifyEmail.backToSignIn")}
          </a>
        </div>
      </div>
    );
  }

  return null;
}
