"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import LoginAccessPanel from "@/components/auth/LoginAccessPanel";
import OnboardingEntrySection from "@/components/auth/OnboardingEntrySection";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import "@/i18n";

const initialLogin = {
  email: "",
  password: "",
};

const initialResetPassword = {
  token: "",
  newPassword: "",
  confirmPassword: "",
};

const initialRegister = {
  name: "",
  companyName: "",
  email: "",
  password: "",
  industry: "landscaping_hardscaping",
};

const SERVICES_CATALOG_INDUSTRIES = new Set([
  "",
  "general",
  "landscaping",
  "hardscaping",
  "landscaping_hardscaping",
]);

function tenantLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "default") {
    return "Principal";
  }
  return String(value || "").trim();
}

function isStrongPassword(value) {
  const password = String(value || "");
  if (password.length < 12) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

export default function AuthShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const isDedicatedLoginPage = pathname === "/login";
  const isResetPasswordPage = pathname === "/reset-password";
  const [trialExpiredParam, setTrialExpiredParam] = useState(false);
  const [loginFailedAttempts, setLoginFailedAttempts] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setTrialExpiredParam(params.get("trial_expired") === "1");
    }
  }, []);
  const { t, i18n } = useTranslation();
  const UI_LANGUAGE_OPTIONS = [
    { value: "en", label: "🇺🇸 English" },
    { value: "es", label: "🇲🇽 Español" },
    { value: "pl", label: "🇵🇱 Polski" },
  ];
  const isPublicQuotePage = pathname?.startsWith("/quote/");
  const [loading, setLoading] = useState(!isPublicQuotePage);
  const authBootstrappedRef = useRef(false);
  const [authUser, setAuthUser] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("register");
  const [signupStage, setSignupStage] = useState("lead");
  const [pendingEmail, setPendingEmail] = useState("");
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [resetPasswordForm, setResetPasswordForm] =
    useState(initialResetPassword);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedAttempts = Number(
      window.sessionStorage.getItem("cf-login-failed-attempts") || 0,
    );
    setLoginFailedAttempts(
      Number.isFinite(storedAttempts) ? storedAttempts : 0,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      "cf-login-failed-attempts",
      String(loginFailedAttempts),
    );
  }, [loginFailedAttempts]);

  // Handle ?auth_error= set by verify-email redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    const modeParam = params.get("mode");
    const resetToken = params.get("token") || params.get("reset_token");

    if ((modeParam === "reset-password" || isResetPasswordPage) && resetToken) {
      setMode("reset-password");
      setResetPasswordForm((current) => ({
        ...current,
        token: resetToken,
      }));
      setNotice("");
      setError("");
      return;
    }

    if (isResetPasswordPage) {
      setMode("reset-password");
      setNotice("");
      setError(resetToken ? "" : t("auth.noResetToken"));
      return;
    }

    if (!authError) return;
    const messages = {
      expired_token: t("auth.verificationExpired"),
      invalid_token: t("auth.verificationInvalid"),
      missing_token: t("auth.verificationMissing"),
    };
    setMode("verify-email");
    setError(messages[authError] || t("auth.verificationFailed"));
    setNotice("");
    window.history.replaceState({}, "", window.location.pathname);
  }, [isResetPasswordPage, t]);
  useEffect(() => {
    if (isDedicatedLoginPage) {
      setMode("login");
      return;
    }

    setMode((current) => (current === "login" ? "register" : current));
  }, [isDedicatedLoginPage]);

  const fetchMe = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me", {
        cache: "no-store",
        suppressUnauthorizedEvent: true,
      });
      if (!res.ok) {
        setAuthUser(null);
        return;
      }
      const payload = await res.json();
      setAuthUser(payload?.data || null);
    } catch {
      setAuthUser(null);
    }
  }, []);

  // Persist industry to localStorage so catalog pages can read it without an extra fetch
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authUser?.industry !== undefined) {
      window.localStorage.setItem("user-industry", authUser.industry || "");
    }
  }, [authUser]);

  useEffect(() => {
    if (isPublicQuotePage) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const run = async () => {
      if (!authBootstrappedRef.current) {
        setLoading(true);
        await fetchMe();
        if (!mounted) return;
        authBootstrappedRef.current = true;
        setLoading(false);
        return;
      }

      // Keep current UI visible and refresh auth context in the background.
      await fetchMe();
    };

    run();

    return () => {
      mounted = false;
    };
  }, [isPublicQuotePage, fetchMe]);

  useEffect(() => {
    if (isPublicQuotePage) {
      return;
    }

    const onUnauthorized = () => {
      if (!authUser) {
        return;
      }
      setAuthUser(null);
      setError(t("auth.sessionExpired"));
      setSubmitting(false);
    };

    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () =>
      window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, [isPublicQuotePage, authUser, t]);

  if (isPublicQuotePage) {
    return children;
  }

  const submitLogin = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        suppressUnauthorizedEvent: true,
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
        }),
      });
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "EMAIL_NOT_VERIFIED") {
          try {
            const resendRes = await apiFetch("/api/auth/resend-verification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              suppressUnauthorizedEvent: true,
              body: JSON.stringify({ email: loginForm.email }),
            });
            await getJsonOrThrow(resendRes, t("auth.resendFailed"));
            setNotice(t("auth.verificationSentNew"));
          } catch {
            setError(t("auth.verificationDeliveryIssue"));
            setNotice("");
          }
          setPendingEmail(loginForm.email);
          setLoginFailedAttempts(0);
          setMode("verify-email");
          return;
        }
      }
      if (res.status === 401) {
        setLoginFailedAttempts((current) => current + 1);
        setError(t("auth.invalidCredentials"));
        return;
      }
      if (res.status === 429) {
        const payload = await res.json().catch(() => ({}));
        setLoginFailedAttempts((current) => Math.max(current, 3));
        setError(payload?.error || t("auth.loginRateLimited"));
        return;
      }
      const payload = await getJsonOrThrow(res, t("auth.loginError"));
      if (!payload.data) {
        setError(t("auth.loginError"));
        return;
      }
      setLoginFailedAttempts(0);
      setAuthUser(payload.data);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err.message || t("auth.authError"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        suppressUnauthorizedEvent: true,
        body: JSON.stringify({
          name: registerForm.name,
          companyName: registerForm.companyName || "",
          email: registerForm.email,
          password: registerForm.password,
          industry: registerForm.industry || "",
        }),
      });
      const payload = await getJsonOrThrow(res, t("auth.registerError"));
      if (payload.data?.requiresVerification) {
        setPendingEmail(payload.data.email || registerForm.email);
        setMode("verify-email");
        if (payload.data?.emailDeliveryFailed) {
          setError(t("auth.verificationDeliveryIssue"));
          setNotice("");
        } else {
          setError("");
          setNotice(t("auth.checkInboxLink"));
        }
      } else {
        setAuthUser(payload.data);
      }
    } catch (err) {
      setError(err.message || t("auth.registerError"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitResendVerification = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        suppressUnauthorizedEvent: true,
        body: JSON.stringify({ email: pendingEmail }),
      });
      await getJsonOrThrow(res, t("auth.resendFailed"));
      setNotice(t("auth.verificationSentNew"));
    } catch (err) {
      setError(err.message || t("auth.resendFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitForgotPassword = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        suppressUnauthorizedEvent: true,
        body: JSON.stringify({ email: forgotPasswordEmail }),
      });
      const payload = await res.json().catch(() => null);
      setNotice(
        payload?.message ||
          t("auth.resetLinkSent") ||
          "If an account exists for this email, a password reset link has been sent.",
      );
    } catch (err) {
      setError(err.message || t("auth.resetPasswordError"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitResetPassword = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");

    if (!resetPasswordForm.token) {
      setError(t("auth.noResetToken"));
      setSubmitting(false);
      return;
    }

    if (resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword) {
      setError(t("auth.passwordMismatch"));
      setSubmitting(false);
      return;
    }

    if (!isStrongPassword(resetPasswordForm.newPassword)) {
      setError(t("auth.passwordStrengthError"));
      setSubmitting(false);
      return;
    }

    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        suppressUnauthorizedEvent: true,
        body: JSON.stringify({
          token: resetPasswordForm.token,
          newPassword: resetPasswordForm.newPassword,
        }),
      });
      await getJsonOrThrow(res, t("auth.resetPasswordError"));
      setNotice(t("auth.passwordUpdated"));
      setMode("login");
      setResetPasswordForm(initialResetPassword);
      setLoginForm((current) => ({
        ...current,
        password: "",
      }));
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/login");
      }
    } catch (err) {
      setError(err.message || t("auth.resetPasswordError"));
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        suppressUnauthorizedEvent: true,
      });
      setAuthUser(null);
      setLoginForm(initialLogin);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("user-industry");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startTrialFromOnboarding = ({ companyName, email }) => {
    setRegisterForm((current) => ({
      ...current,
      companyName,
      email,
    }));
    setSignupStage("account");
    setMode("register");
    setError("");
    setNotice("");

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("signup-card")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        document.getElementById("register-name-input")?.focus();
      });
    }
  };

  const updateRegisterField = (field, value) => {
    setRegisterForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const backToSignupSetup = () => {
    setSignupStage("lead");
    setMode("register");
    setError("");
    setNotice("");
    setPendingEmail("");
    setRegisterForm((current) => ({
      ...current,
      name: "",
      password: "",
    }));
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f4f5f7",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#16a34a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 800,
              fontSize: 16,
              margin: "0 auto 16px",
            }}
          >
            CF
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
            {t("auth.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    if (
      isDedicatedLoginPage ||
      isResetPasswordPage ||
      mode === "verify-email" ||
      mode === "forgot-password" ||
      mode === "reset-password"
    ) {
      return (
        <LoginAccessPanel
          error={error}
          notice={notice}
          mode={mode}
          submitting={submitting}
          pendingEmail={pendingEmail}
          forgotPasswordEmail={forgotPasswordEmail}
          loginForm={loginForm}
          loginFailedAttempts={loginFailedAttempts}
          resetPasswordForm={resetPasswordForm}
          onLoginFormChange={setLoginForm}
          onForgotPasswordEmailChange={setForgotPasswordEmail}
          onResetPasswordFormChange={setResetPasswordForm}
          onSubmitLogin={submitLogin}
          onSubmitForgotPassword={submitForgotPassword}
          onSubmitResetPassword={submitResetPassword}
          onResendVerification={submitResendVerification}
          onShowForgotPassword={() => {
            setForgotPasswordEmail(loginForm.email || "");
            setMode("forgot-password");
            setError("");
            setNotice("");
          }}
          onShowRegister={() => {
            router.replace("/");
          }}
          onBackToLogin={() => {
            setMode("login");
            setError("");
            setNotice("");
            setResetPasswordForm(initialResetPassword);
            if (typeof window !== "undefined") {
              const targetPath = "/login";
              window.history.replaceState({}, "", targetPath);
            }
          }}
        />
      );
    }

    return (
      <OnboardingEntrySection
        initialValues={{
          companyName: registerForm.companyName,
          email: registerForm.email,
        }}
        registerValues={registerForm}
        signupStage={signupStage}
        mode={mode}
        error={error}
        submitting={submitting}
        pendingEmail={pendingEmail}
        onStartTrial={startTrialFromOnboarding}
        onRegisterFieldChange={updateRegisterField}
        onSubmitRegister={submitRegister}
        onBackToSetup={backToSignupSetup}
        onResendVerification={submitResendVerification}
        languageOptions={UI_LANGUAGE_OPTIONS}
        selectedLanguage={i18n.language}
        onLanguageChange={(value) => i18n.changeLanguage(value)}
      />
    );
  }

  // ─── SVG icon helpers ────────────────────────────────────────────────────
  const Icon = ({ d, size = 16 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {Array.isArray(d)
        ? d.map((pathValue) => <path key={pathValue} d={pathValue} />)
        : <path d={d} />}
    </svg>
  );

  const icons = {
    dashboard: [
      "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
      "M9 22V12h6v10",
    ],
    clients: [
      "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2",
      "M9 11a4 4 0 100-8 4 4 0 000 8",
      "M23 21v-2a4 4 0 00-3-3.87",
      "M16 3.13a4 4 0 010 7.75",
    ],
    jobs: [
      "M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z",
      "M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z",
    ],
    invoices: [
      "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z",
      "M14 2v6h6",
      "M16 13H8",
      "M16 17H8",
      "M10 9H8",
    ],
    billPayments: [
      "M4 6h16a2 2 0 012 2v8a6 6 0 01-6 6H8a6 6 0 01-6-6V8a2 2 0 012-2z",
      "M16 11a4 4 0 10-8 0 4 4 0 008 0z",
      "M18 6V4",
      "M6 6V4",
    ],
    estimates: [
      "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7",
      "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
    ],
    calendar: [
      "M8 2v4",
      "M16 2v4",
      "M3 8h18",
      "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
    ],
    smart: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
    services: [
      "M8 6h13",
      "M8 12h13",
      "M8 18h13",
      "M3 6h.01",
      "M3 12h.01",
      "M3 18h.01",
    ],
    settings: [
      "M12 15a3 3 0 100-6 3 3 0 000 6z",
      "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
    ],
    platform: [
      "M12 2l9 4.9V17L12 22 3 17V6.9z",
      "M12 22V12",
      "M21 6.9L12 12",
      "M3 6.9L12 12",
    ],
    logout: [
      "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4",
      "M16 17l5-5-5-5",
      "M21 12H9",
    ],
  };

  // ─── Nav groups ──────────────────────────────────────────────────────────
  const mainNavItems = [
    { href: "/", label: t("sidebar.dashboard"), iconKey: "dashboard" },
    { href: "/clients", label: t("sidebar.clients"), iconKey: "clients" },
    {
      href: "/estimate-builder",
      label: t("sidebar.estimates"),
      iconKey: "estimates",
    },
    { href: "/jobs", label: t("sidebar.jobs"), iconKey: "jobs" },
    { href: "/invoices", label: t("sidebar.invoices"), iconKey: "invoices" },
    {
      href: "/bill-payments",
      label: t("sidebar.billPayments"),
      iconKey: "billPayments",
    },
  ];

  const secondaryNavItems = [
    { href: "/calendar", label: t("sidebar.calendar"), iconKey: "calendar" },
    {
      href: "/smart-estimator",
      label: t("sidebar.insights"),
      iconKey: "smart",
    },
    ...(SERVICES_CATALOG_INDUSTRIES.has(authUser.industry || "")
      ? [
          {
            href: "/services-catalog",
            label: t("sidebar.services"),
            iconKey: "services",
          },
        ]
      : []),
  ];

  const bottomNavItems = [
    ...(authUser.role === "super_admin"
      ? [
          {
            href: "/platform",
            label: t("sidebar.platform"),
            iconKey: "platform",
          },
        ]
      : []),
    {
      href: "/workspace-owner",
      label: t("sidebar.settings"),
      iconKey: "settings",
    },
  ];

  const isActive = (href) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  const linkClass = (href) => `sb-link${isActive(href) ? " sb-active" : ""}`;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* ─── Fixed left sidebar ───────────────────────────── */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 240,
          background: "#1F2937",
          display: "flex",
          flexDirection: "column",
          zIndex: 40,
          overflowY: "auto",
          overflowX: "hidden",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "#16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 13,
                flexShrink: 0,
                letterSpacing: "-0.3px",
              }}
            >
              CF
            </div>
            <span
              style={{
                color: "#F9FAFB",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "-0.4px",
              }}
            >
              ContractorFlow
            </span>
          </div>

          {/* User pill */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
                textTransform: "uppercase",
              }}
            >
              {(authUser.name || "?").charAt(0)}
            </div>
            <div style={{ overflow: "hidden", flex: 1 }}>
              <div
                style={{
                  color: "#F9FAFB",
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: "-0.2px",
                }}
              >
                {authUser.name}
              </div>
              <div
                style={{
                  color: "#6B7280",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginTop: 1,
                }}
              >
                {authUser.role} · {tenantLabel(authUser.tenantId)}
              </div>
            </div>
          </div>
        </div>

        {/* Main nav group */}
        <nav
          style={{
            flex: 1,
            padding: "4px 10px 0",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Section label */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#4B5563",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "8px 12px 6px",
            }}
          >
            {t("sidebar.main")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {mainNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(item.href)}
              >
                <span
                  className="sb-icon"
                  style={{
                    color: isActive(item.href) ? "#4ade80" : "#6B7280",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <Icon d={icons[item.iconKey]} />
                </span>
                {item.label}
              </Link>
            ))}
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: "rgba(255,255,255,0.06)",
              margin: "12px 2px",
            }}
          />

          {/* Secondary nav group */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#4B5563",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0 12px 6px",
            }}
          >
            {t("sidebar.secondary")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {secondaryNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(item.href)}
              >
                <span
                  className="sb-icon"
                  style={{
                    color: isActive(item.href) ? "#4ade80" : "#6B7280",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <Icon d={icons[item.iconKey]} />
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Bottom nav */}
        <div style={{ padding: "0 10px 8px" }}>
          <div
            style={{
              height: 1,
              background: "rgba(255,255,255,0.06)",
              margin: "8px 2px 10px",
            }}
          />
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#4B5563",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0 12px 6px",
            }}
          >
            {t("sidebar.account")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {bottomNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(item.href)}
              >
                <span
                  className="sb-icon"
                  style={{
                    color: isActive(item.href) ? "#4ade80" : "#6B7280",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <Icon d={icons[item.iconKey]} />
                </span>
                {item.label}
              </Link>
            ))}
            <div
              style={{
                padding: "8px 0",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                marginTop: 4,
                marginBottom: 4,
              }}
            >
              <select
                value={i18n.language?.split("-")[0]}
                onChange={(e) => {
                  const lang = e.target.value;
                  i18n.changeLanguage(lang);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("ui-language", lang);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#D1D5DB",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {UI_LANGUAGE_OPTIONS.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    style={{ background: "#1F2937" }}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={submitting}
              className="sb-link"
              style={{ color: "#6B7280" }}
            >
              <span
                className="sb-icon"
                style={{ color: "#6B7280", display: "flex", flexShrink: 0 }}
              >
                <Icon d={icons.logout} />
              </span>
              {submitting ? t("sidebar.signingOut") : t("sidebar.logout")}
            </button>
          </div>
        </div>

        <div style={{ height: 12 }} />
      </aside>

      {/* ─── Main content area ────────────────────────────── */}
      <div
        style={{
          marginLeft: 240,
          flex: 1,
          minHeight: "100vh",
          background: "#f4f5f7",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TrialBanner
          authUser={authUser}
          trialExpired={trialExpiredParam}
          t={t}
        />
        {children}
      </div>
    </div>
  );
}

// ─── Trial banner ────────────────────────────────────────────────────────────
function TrialBanner({ authUser, trialExpired, t }) {
  if (!authUser || authUser.isSubscribed || authUser.role === "super_admin")
    return null;

  const now = Date.now();
  const trialEnd = authUser.trialEndDate
    ? new Date(authUser.trialEndDate).getTime()
    : null;
  const isExpired = trialExpired || (trialEnd !== null && now > trialEnd);
  const daysLeft =
    trialEnd !== null && !isExpired
      ? Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)))
      : 0;

  if (!isExpired && (trialEnd === null || daysLeft > 7)) return null;

  const urgent = isExpired || daysLeft <= 3;
  const bg = isExpired ? "#fef2f2" : urgent ? "#fff7ed" : "#fffbeb";
  const border = isExpired ? "#fca5a5" : urgent ? "#fdba74" : "#fcd34d";
  const color = isExpired ? "#991b1b" : urgent ? "#92400e" : "#78350f";

  const message = isExpired
    ? t("trial.expired")
    : t("trial.daysLeft", { count: daysLeft });

  return (
    <div
      style={{
        background: bg,
        borderBottom: `1px solid ${border}`,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        fontSize: 13,
        color,
        fontWeight: 500,
      }}
    >
      <span>{message}</span>
      <Link
        href="/workspace-owner"
        style={{
          background: isExpired ? "#ef4444" : "#f59e0b",
          color: "#fff",
          padding: "5px 14px",
          borderRadius: 6,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 12,
          whiteSpace: "nowrap",
        }}
      >
        {t("trial.subscribe")}
      </Link>
    </div>
  );
}
