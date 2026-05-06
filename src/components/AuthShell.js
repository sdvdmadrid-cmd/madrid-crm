"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import LoginAccessPanel from "@/components/auth/LoginAccessPanel";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { supabase } from "@/lib/supabase";
import "@/i18n";
import AppFooter from "@/components/site/AppFooter";

const AUTH_DEBUG = process.env.NEXT_PUBLIC_AUTH_DEBUG === "1";

function maskToken(value) {
  const raw = String(value || "");
  if (!raw) return null;
  if (raw.length <= 12) return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

const initialLogin = {
  email: "",
  password: "",
};

const initialResetPassword = {
  token: "",
  accessToken: "",
  refreshToken: "",
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
  const isVerifyEmailPage = pathname === "/verify-email";
  const [trialExpiredParam, setTrialExpiredParam] = useState(false);
  const [loginFailedAttempts, setLoginFailedAttempts] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setTrialExpiredParam(params.get("trial_expired") === "1");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isDedicatedLoginPage) return;

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryMode = searchParams.get("mode") || "";
    const queryToken =
      searchParams.get("token") ||
      searchParams.get("reset_token") ||
      searchParams.get("token_hash") ||
      "";
    const hashToken = hashParams.get("token") || hashParams.get("token_hash") || "";
    const hashType = hashParams.get("type") || "";
    const hasRecoveryHashSession =
      hashType === "recovery" && Boolean(hashParams.get("access_token") || hashToken);
    const hasRecoveryQueryToken =
      queryMode === "reset-password" && Boolean(queryToken);

    if (!hasRecoveryHashSession && !hasRecoveryQueryToken) {
      return;
    }

    const target = `/reset-password${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }, [isDedicatedLoginPage]);

  const { t, i18n } = useTranslation();
  const UI_LANGUAGE_OPTIONS = [
    { value: "en", label: "🇺🇸 English" },
    { value: "es", label: "🇲🇽 Español" },
    { value: "pl", label: "🇵🇱 Polski" },
  ];
  const isPublicQuotePage = pathname?.startsWith("/quote/");
  const isPublicSitePage = pathname?.startsWith("/site/");
  const isPublicLegalPage = pathname === "/legal" || pathname?.startsWith("/legal#") || pathname === "/legal-required";
  const isMarketingHomePage = pathname === "/";
  const isPublicPage =
    isPublicQuotePage ||
    isPublicSitePage ||
    isPublicLegalPage ||
    isMarketingHomePage ||
    isVerifyEmailPage;
  const [loading, setLoading] = useState(!isPublicPage);
  const [authHydrating, setAuthHydrating] = useState(!isPublicPage);
  const authBootstrappedRef = useRef(false);
  const [authUser, setAuthUser] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("login");
  const [pendingEmail, setPendingEmail] = useState("");
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [resetPasswordForm, setResetPasswordForm] =
    useState(initialResetPassword);
  const [submitting, setSubmitting] = useState(false);
  const [platformFlags, setPlatformFlags] = useState({
    featureWebsiteBuilder: true,
    featureEstimateBuilder: true,
    featureAiDescription: true,
    featureAiInvoiceAssistant: true,
    featureAdminAiAssistant: true,
  });

  useEffect(() => {
    if (isPublicPage) return;

    let cancelled = false;

    const loadFlags = async () => {
      try {
        const res = await apiFetch("/api/feature-flags", { suppressUnauthorizedEvent: true });
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        if (!payload?.success || !payload?.data || cancelled) return;
        setPlatformFlags((prev) => ({ ...prev, ...payload.data }));
      } catch {
        // Non-blocking: keep defaults when flags endpoint is unavailable.
      }
    };

    loadFlags();

    return () => {
      cancelled = true;
    };
  }, [isPublicPage]);

  useEffect(() => {
    if (isPublicPage) {
      setAuthHydrating(false);
      return;
    }

    setAuthHydrating(true);

    // Listen for Supabase browser-side SIGNED_IN events (password login, token refresh).
    // Only sync when Supabase has an ACTIVE session — never call sync with null to
    // avoid any chance of wiping the app cookie set by the server callback.
    const syncServerSession = async (trigger, event, session) => {
      if (AUTH_DEBUG) {
        console.info("[auth:onAuthStateChange] event", {
          pathname,
          trigger,
          event,
          hasSession: Boolean(session),
          userId: session?.user?.id || null,
          accessToken: maskToken(session?.access_token),
          refreshToken: maskToken(session?.refresh_token),
        });
      }

      if (!session) {
        // No Supabase browser session — this is normal after email-verification
        // callback (session is server-side only). Signal hydration done.
        setAuthHydrating(false);
        return;
      }
      try {
        const syncRes = await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ trigger, event, hasSession: true }),
        });
        if (AUTH_DEBUG) {
          console.info("[auth:onAuthStateChange] sync response", {
            pathname,
            status: syncRes.status,
            ok: syncRes.ok,
          });
        }
      } catch (syncError) {
        console.error("[auth:onAuthStateChange] sync failed", {
          trigger,
          event,
          error: syncError?.message || "unknown_error",
        });
      } finally {
        setAuthHydrating(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      syncServerSession("listener", event, session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isPublicPage]);

  useEffect(() => {
    if (!AUTH_DEBUG) return;
    if (typeof window === "undefined") return;
    if (isPublicPage) return;

    const run = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        console.info("[authshell] supabase.getSession", {
          pathname,
          hasSession: Boolean(session),
          userId: session?.user?.id || null,
          accessToken: maskToken(session?.access_token),
          refreshToken: maskToken(session?.refresh_token),
          error: sessionError?.message || null,
        });

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        console.info("[authshell] supabase.getUser", {
          pathname,
          hasUser: Boolean(user),
          userId: user?.id || null,
          emailConfirmedAt: user?.email_confirmed_at || null,
          error: userError?.message || null,
        });
      } catch (error) {
        console.warn("[authshell] supabase session debug failed", {
          pathname,
          error: error?.message || "unknown_error",
        });
      }
    };

    run();
  }, [isPublicPage, pathname]);

  useEffect(() => {
    if (!authUser) return;
    if (!isDedicatedLoginPage && !isResetPasswordPage) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const redirectParam = (params.get("redirect") || "").trim();
    const safeRedirect = redirectParam.startsWith("/")
      ? redirectParam
      : "/dashboard";

    router.replace(safeRedirect);
  }, [authUser, isDedicatedLoginPage, isResetPasswordPage, router]);

  const detectMobileViewport = useCallback(() => {
    if (typeof window === "undefined") return false;

    const candidateWidths = [
      window.innerWidth,
      window.visualViewport?.width,
      document?.documentElement?.clientWidth,
    ].filter((value) => Number.isFinite(value) && value > 0);

    const viewportWidth =
      candidateWidths.length > 0 ? Math.min(...candidateWidths) : 1440;
    const coarsePointer =
      window.matchMedia?.("(pointer: coarse)")?.matches || false;
    const touchCapable =
      coarsePointer ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);

    // Treat phones and touch-first small tablets as mobile navigation mode.
    return viewportWidth <= 1200 || (touchCapable && viewportWidth <= 1366);
  }, []);

  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    detectMobileViewport(),
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => {
      setIsMobileViewport(detectMobileViewport());
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    const mediaQuery = window.matchMedia?.("(max-width: 1200px)");
    const onMediaChange = () => updateViewport();
    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener("change", onMediaChange);
    } else if (mediaQuery?.addListener) {
      mediaQuery.addListener(onMediaChange);
    }

    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener("resize", updateViewport);
    }

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener("change", onMediaChange);
      } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(onMediaChange);
      }
      if (visualViewport) {
        visualViewport.removeEventListener("resize", updateViewport);
      }
    };
  }, [detectMobileViewport]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

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
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authError = params.get("auth_error");
    const modeParam = params.get("mode");
    const resetToken =
      params.get("token") ||
      params.get("reset_token") ||
      params.get("token_hash") ||
      hashParams.get("token") ||
      hashParams.get("token_hash");
    const accessToken = hashParams.get("access_token") || "";
    const refreshToken = hashParams.get("refresh_token") || "";
    const hashType = hashParams.get("type") || "";
    const hasRecoverySession = hashType === "recovery" && Boolean(accessToken);

    if (
      (modeParam === "reset-password" || isResetPasswordPage || hasRecoverySession) &&
      (resetToken || hasRecoverySession)
    ) {
      setMode("reset-password");
      setResetPasswordForm((current) => ({
        ...current,
        token: resetToken,
        accessToken,
        refreshToken,
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
    // ?verified=1: session creation failed but email IS confirmed — no loop
    const verifiedParam = params.get("verified");
    if (verifiedParam === "1") {
      setMode("login");
      setNotice(t("auth.emailVerifiedPleaseLogin") || "✓ Email verified! Please sign in.");
      setError("");
      const prefilledEmail = params.get("email") || "";
      if (prefilledEmail) {
        setLoginForm((prev) => ({ ...prev, email: prefilledEmail }));
      }
      window.history.replaceState({}, "", window.location.pathname);
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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email") || "";
    if (!emailParam) return;
    setLoginForm((current) => ({ ...current, email: emailParam }));
    setRegisterForm((current) => ({ ...current, email: emailParam }));
  }, [pathname]);

  useEffect(() => {
    if (isDedicatedLoginPage) {
      const params =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
      const modeParam = params?.get("mode") || "";
      setMode(modeParam === "register" ? "register" : "login");
      return;
    }

    if (isResetPasswordPage) {
      return;
    }

    setMode((current) => (
      current === "verify-email" ||
      current === "forgot-password" ||
      current === "reset-password"
    )
      ? current
      : "login");
  }, [isDedicatedLoginPage, isResetPasswordPage]);

  const fetchMe = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me", {
        cache: "no-store",
        suppressUnauthorizedEvent: true,
      });
      if (AUTH_DEBUG) {
        console.info("[dashboard-load] /api/auth/me response", {
          pathname,
          status: res.status,
          ok: res.ok,
        });
      }
      if (!res.ok) {
        setAuthUser(null);
        return;
      }
      const payload = await res.json();
      if (AUTH_DEBUG) {
        console.info("[dashboard-load] /api/auth/me payload", {
          pathname,
          hasUser: Boolean(payload?.data?.userId),
          userId: payload?.data?.userId || null,
          role: payload?.data?.role || null,
        });
      }
      setAuthUser(payload?.data || null);
    } catch {
      setAuthUser(null);
    }
  }, [pathname]);

  // Persist industry to localStorage so catalog pages can read it without an extra fetch
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authUser?.industry !== undefined) {
      window.localStorage.setItem("user-industry", authUser.industry || "");
    }
  }, [authUser]);

  useEffect(() => {
    if (isPublicPage) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const run = async () => {
      if (!authBootstrappedRef.current) {
        console.info("[dashboard-protection] loading auth context", {
          pathname,
          loading: true,
          authHydrating,
        });
        setLoading(true);
        await fetchMe();
        if (!mounted) return;
        authBootstrappedRef.current = true;
        setLoading(authHydrating);
        console.info("[dashboard-protection] auth context loaded", {
          pathname,
          loading: authHydrating,
        });
        return;
      }

      // Keep current UI visible and refresh auth context in the background.
      await fetchMe();
      if (!mounted) return;
      setLoading(authHydrating);
    };

    run();

    return () => {
      mounted = false;
    };
  }, [isPublicPage, fetchMe, pathname, authHydrating]);

  useEffect(() => {
    if (isPublicPage) return;
    if (!authHydrating && authBootstrappedRef.current) {
      setLoading(false);
    }
  }, [isPublicPage, authHydrating]);

  useEffect(() => {
    if (isPublicPage) {
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
  }, [isPublicPage, authUser, t]);

  if (isPublicPage) {
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
      router.replace("/dashboard");
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
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const retryAfter = Number(payload?.retryAfterSeconds || 0);
        if (res.status === 429 && retryAfter > 0) {
          setError(`${payload?.error || t("auth.loginRateLimited")} (${retryAfter}s)`);
        } else {
          setError(payload?.error || t("auth.resetPasswordError"));
        }
        return;
      }

      if (payload?.resetUrl) {
        if (typeof window !== "undefined") {
          window.location.href = payload.resetUrl;
        }
        return;
      }

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

    if (!resetPasswordForm.token && !resetPasswordForm.accessToken) {
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
          accessToken: resetPasswordForm.accessToken,
          refreshToken: resetPasswordForm.refreshToken,
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
        // Redirect to home page after logout
        router.push("/");
      }
    } finally {
      setSubmitting(false);
    }
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
              borderRadius: 12,
              background: "linear-gradient(145deg, #0d4fd9 0%, #091220 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 800,
              fontSize: 16,
              margin: "0 auto 16px",
            }}
          >
            FB
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
            {t("auth.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    if (isPublicPage) {
      return children;
    }

    return (
      <LoginAccessPanel
        error={error}
        notice={notice}
        mode={mode}
        submitting={submitting}
        pendingEmail={pendingEmail}
        forgotPasswordEmail={forgotPasswordEmail}
        loginForm={loginForm}
        registerForm={registerForm}
        loginFailedAttempts={loginFailedAttempts}
        resetPasswordForm={resetPasswordForm}
        onLoginFormChange={setLoginForm}
        onRegisterFormChange={setRegisterForm}
        onForgotPasswordEmailChange={setForgotPasswordEmail}
        onResetPasswordFormChange={setResetPasswordForm}
        onSubmitLogin={submitLogin}
        onSubmitRegister={submitRegister}
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
          setMode("register");
          setError("");
          setNotice("");
          router.replace("/login?mode=register");
        }}
        onBackToLogin={() => {
          setMode("login");
          setError("");
          setNotice("");
          setResetPasswordForm(initialResetPassword);
          if (typeof window !== "undefined") {
            const targetPath = "/login?mode=login";
            window.history.replaceState({}, "", targetPath);
          }
        }}
      />
    );
  }

  if (isDedicatedLoginPage || isResetPasswordPage) {
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
              borderRadius: 12,
              background: "linear-gradient(145deg, #0d4fd9 0%, #091220 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 800,
              fontSize: 16,
              margin: "0 auto 16px",
            }}
          >
            FB
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
            {t("auth.loading")}
          </p>
        </div>
      </div>
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
    websiteBuilder: [
      "M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z",
      "M8 20h8",
      "M12 15v5",
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

  const isSuperAdminRole =
    String(authUser?.role || "").toLowerCase() === "super_admin";

  // ─── Nav groups ──────────────────────────────────────────────────────────
  const mainNavItems = isSuperAdminRole
    ? [
        {
          href: "/admin",
          label: t("sidebar.platform"),
          iconKey: "platform",
        },
      ]
    : [
        {
          href: "/dashboard",
          label: t("sidebar.dashboard"),
          iconKey: "dashboard",
        },
        { href: "/clients", label: t("sidebar.clients"), iconKey: "clients" },
        {
          href: "/estimates",
          label: t("sidebar.estimates"),
          iconKey: "estimates",
          exact: true,
        },
        { href: "/jobs", label: t("sidebar.jobs"), iconKey: "jobs" },
        {
          href: "/invoices",
          label: t("sidebar.invoices"),
          iconKey: "invoices",
        },
        {
          href: "/bill-payments",
          label: t("sidebar.billPayments"),
          iconKey: "billPayments",
        },
      ];

  const secondaryNavItems = isSuperAdminRole
    ? [
        ...(platformFlags.featureWebsiteBuilder
          ? [
              {
                href: "/website",
                label: t("sidebar.websiteBuilder"),
                iconKey: "websiteBuilder",
              },
            ]
          : []),
      ]
    : [
        {
          href: "/calendar",
          label: t("sidebar.calendar"),
          iconKey: "calendar",
        },
        {
          href: "/services-catalog",
          label: t("sidebar.services"),
          iconKey: "services",
        },
        {
          href: "/lead-inbox",
          label: t("sidebar.leadInbox"),
          iconKey: "insights",
        },
      ];

  const bottomNavItems = [
    {
      href: "/workspace-owner",
      label: t("sidebar.settings"),
      iconKey: "settings",
    },
  ];

  const isActive = (href, exact = false) => {
    if (exact) return pathname === href;
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  const linkClass = (href, exact = false) => `sb-link${isActive(href, exact) ? " sb-active" : ""}`;

  const onNavigationItemClick = () => {
    if (isMobileViewport) {
      setMobileSidebarOpen(false);
    }
  };

  return (
    <div
      className="auth-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
        position: "relative",
      }}
    >
      <header
        className="auth-shell-mobile-header"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 64,
          background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
          borderBottom: "1px solid rgba(148,163,184,0.2)",
          display: isMobileViewport ? "flex" : "none",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          zIndex: 60,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: "linear-gradient(145deg, #0d4fd9 0%, #091220 100%)",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <span style={{ position: "absolute", left: 7, top: 8, width: 16, height: 6, borderRadius: 999, background: "linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.18) 100%)" }} />
            <span style={{ position: "absolute", right: 7, bottom: 7, width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
          </div>
          <span
            style={{
              color: "#F9FAFB",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.3px",
            }}
          >
            FieldBase
          </span>
        </div>

        <button
          type="button"
          aria-label={mobileSidebarOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileSidebarOpen((current) => !current)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.3)",
            background: "rgba(148,163,184,0.12)",
            color: "#e2e8f0",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d={mobileSidebarOpen ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
          </svg>
        </button>
      </header>

      {mobileSidebarOpen && (
        <button
          className="auth-shell-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.58)",
            border: 0,
            padding: 0,
            margin: 0,
            zIndex: 45,
          }}
        />
      )}

      {/* ─── Fixed left sidebar ───────────────────────────── */}
      <aside
        className={`auth-shell-aside${mobileSidebarOpen ? " auth-shell-aside--open" : ""}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: isMobileViewport ? "min(86vw, 320px)" : 248,
          background: "linear-gradient(180deg, #0f172a 0%, #111827 62%, #0b1220 100%)",
          display: "flex",
          flexDirection: "column",
          zIndex: 50,
          overflowY: "auto",
          overflowX: "hidden",
          borderRight: "1px solid rgba(148,163,184,0.18)",
          transform: isMobileViewport
            ? (mobileSidebarOpen ? "translateX(0)" : "translateX(-102%)")
            : "translateX(0)",
          transition: "transform 0.22s ease",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "22px 16px 16px" }}>
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
                width: 36,
                height: 36,
                borderRadius: 12,
                background: "linear-gradient(145deg, #0d4fd9 0%, #091220 100%)",
                position: "relative",
                flexShrink: 0,
              }}
            >
              <span style={{ position: "absolute", left: 8, top: 9, width: 20, height: 7, borderRadius: 999, background: "linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.18) 100%)" }} />
              <span style={{ position: "absolute", right: 8, bottom: 8, width: 7, height: 7, borderRadius: "50%", background: "#f59e0b" }} />
            </div>
            <span
              style={{
                color: "#F9FAFB",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "-0.4px",
              }}
            >
              FieldBase
            </span>
          </div>

          {/* User pill */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(148,163,184,0.12)",
              border: "1px solid rgba(148,163,184,0.22)",
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
                background: "linear-gradient(145deg, #1d4ed8 0%, #0c2461 100%)",
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
              {(authUser.companyName || authUser.name || "?").charAt(0).toUpperCase()}
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
                {authUser.companyName || authUser.name}
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
                {authUser.name} · {authUser.role}
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
                onClick={onNavigationItemClick}
                className={linkClass(item.href, item.exact)}
              >
                <span
                  className="sb-icon"
                  style={{
                    color: isActive(item.href, item.exact) ? "#93c5fd" : "#64748b",
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
                onClick={onNavigationItemClick}
                className={linkClass(item.href, item.exact)}
              >
                <span
                  className="sb-icon"
                  style={{
                    color: isActive(item.href, item.exact) ? "#93c5fd" : "#64748b",
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
                onClick={onNavigationItemClick}
                className={linkClass(item.href, item.exact)}
              >
                <span
                  className="sb-icon"
                  style={{
                    color: isActive(item.href, item.exact) ? "#93c5fd" : "#64748b",
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
                  border: "1px solid rgba(148,163,184,0.24)",
                  background: "rgba(148,163,184,0.12)",
                  color: "#e2e8f0",
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
              style={{ color: "#94a3b8" }}
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
        className="auth-shell-main"
        style={{
          marginLeft: isMobileViewport ? 0 : 248,
          flex: 1,
          minWidth: 0,
          minHeight: "100vh",
          background: "#f3f5fa",
          display: "flex",
          flexDirection: "column",
          paddingTop: isMobileViewport ? 64 : 0,
        }}
      >
        <TrialBanner
          authUser={authUser}
          trialExpired={trialExpiredParam}
          t={t}
        />
        {children}
        <AppFooter />
      </div>

      <style jsx global>{`
        @media (max-width: 1200px) {
          .auth-shell-main {
            margin-left: 0 !important;
            padding-top: 64px !important;
          }

          .auth-shell-mobile-header {
            display: flex !important;
          }

          .auth-shell-aside {
            width: min(86vw, 320px) !important;
            transform: translateX(-102%) !important;
            transition: transform 0.22s ease !important;
          }

          .auth-shell-aside.auth-shell-aside--open {
            transform: translateX(0) !important;
          }
        }
      `}</style>

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
