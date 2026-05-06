"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import "@/i18n";

const AUTH_DEBUG =
  process.env.NEXT_PUBLIC_AUTH_DEBUG === "1";

function maskToken(value) {
  const raw = String(value || "");
  if (!raw) return null;
  if (raw.length <= 12) return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

const ERROR_KEYS = {
  expired_token: "auth.verificationExpired",
  invalid_token: "auth.verificationInvalid",
  missing_token: "auth.verificationMissing",
  missing_code: "auth.verificationMissing",
  exchange_failed: "auth.verificationFailed",
  email_not_confirmed: "auth.verificationInvalid",
};

function hasVerificationParams(params) {
  return Boolean(
    params.get("code") ||
      params.get("token_hash") ||
      params.get("token") ||
      params.get("access_token") ||
      params.get("refresh_token"),
  );
}

function VerifyEmailContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const tokenHash = (searchParams.get("token_hash") || "").trim();
  const code = (searchParams.get("code") || "").trim();
  const type = (searchParams.get("type") || "").trim();
  const errorParam = (searchParams.get("error") || searchParams.get("auth_error") || "").trim();

  const [state, setState] = useState("idle"); // idle | verifying | success | error
  const [errorMessage, setErrorMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (AUTH_DEBUG) {
      console.info("[verify-email] mount", {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      });
    }

    const hash = String(window.location.hash || "").replace(/^#/, "").trim();
    if (!hash) return;

    const hashParams = new URLSearchParams(hash);
    if (!hasVerificationParams(hashParams)) return;

    setState("verifying");
    const callbackParams = new URLSearchParams(hashParams.toString());
    if (AUTH_DEBUG) {
      console.info("[verify-email] hash params -> callback redirect", {
        pathname: window.location.pathname,
        redirectTo: `/auth/callback?${callbackParams.toString()}`,
      });
    }
    window.location.replace(`/auth/callback?${callbackParams.toString()}`);
  }, []);

  useEffect(() => {
    if (errorParam) return;
    if (hasVerificationParams(searchParams)) return;

    let cancelled = false;

    const resumeFromExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (AUTH_DEBUG) {
          console.info("[verify-email] getSession", {
            pathname: window.location.pathname,
            hasSession: Boolean(session),
            userId: session?.user?.id || null,
            accessToken: maskToken(session?.access_token),
            refreshToken: maskToken(session?.refresh_token),
          });
        }

        const user = session?.user || null;
        if (!user?.email_confirmed_at) {
          if (AUTH_DEBUG) {
            console.info("[verify-email] session user not confirmed, staying idle", {
              userId: user?.id || null,
            });
          }
          return;
        }

        if (cancelled) return;
        setState("verifying");

        await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ trigger: "verify-email-idle-resume" }),
        });

        if (cancelled) return;
        if (AUTH_DEBUG) {
          console.info("[verify-email] idle resume -> redirect", {
            pathname: window.location.pathname,
            redirectTo: "/dashboard",
          });
        }
        window.location.replace("/dashboard");
      } catch {
        // Keep idle view when no resumable session exists.
      }
    };

    resumeFromExistingSession();

    return () => {
      cancelled = true;
    };
  }, [errorParam, searchParams]);

  useEffect(() => {
    if (errorParam) {
      if (AUTH_DEBUG) {
        console.info("[verify-email] auth error param", {
          pathname:
            typeof window !== "undefined" ? window.location.pathname : "/verify-email",
          errorParam,
        });
      }
      setState("error");
      setErrorMessage(t(ERROR_KEYS[errorParam] || "auth.verificationFailed"));
      return;
    }

    if (hasVerificationParams(searchParams)) {
      setState("verifying");
      // Supabase verification flow: exchange code/token_hash into a real session.
      const params = new URLSearchParams(searchParams.toString());
      if (token && !params.get("token_hash")) {
        params.set("token_hash", token);
        params.delete("token");
      }
      if (AUTH_DEBUG && typeof window !== "undefined") {
        console.info("[verify-email] query params -> callback redirect", {
          pathname: window.location.pathname,
          hasCode: Boolean(params.get("code")),
          hasTokenHash: Boolean(params.get("token_hash")),
          hasAccessToken: Boolean(params.get("access_token")),
          hasRefreshToken: Boolean(params.get("refresh_token")),
          redirectTo: `/auth/callback?${params.toString()}`,
        });
      }
      window.location.replace(`/auth/callback?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, errorParam, searchParams, t, token, tokenHash, type]);

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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
