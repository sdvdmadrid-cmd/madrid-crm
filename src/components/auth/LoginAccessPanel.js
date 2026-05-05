"use client";

import { useTranslation } from "react-i18next";

function isStrongPassword(value) {
  const password = String(value || "");
  if (password.length < 12) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

function cardAlertStyles(kind) {
  if (kind === "error") {
    return {
      color: "#991b1b",
      background: "#fef2f2",
      border: "1px solid #fecaca",
    };
  }

  return {
    color: "#166534",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
  };
}

export default function LoginAccessPanel({
  error,
  notice,
  mode,
  submitting,
  pendingEmail,
  forgotPasswordEmail,
  loginForm,
  registerForm,
  loginFailedAttempts,
  resetPasswordForm,
  onLoginFormChange,
  onRegisterFormChange,
  onForgotPasswordEmailChange,
  onResetPasswordFormChange,
  onSubmitLogin,
  onSubmitRegister,
  onSubmitForgotPassword,
  onSubmitResetPassword,
  onResendVerification,
  onShowForgotPassword,
  onShowRegister,
  onBackToLogin,
}) {
  const { t } = useTranslation();
  const shouldHighlightForgotPassword = loginFailedAttempts >= 3;
  const passwordStrong = isStrongPassword(resetPasswordForm?.newPassword);

  const shellStyle = {
    minHeight: "100dvh",
    display: "grid",
    background: "#f4f5f7",
    fontFamily: "'Inter', system-ui, sans-serif",
  };

  const sidebarStyle = {
    background:
      "linear-gradient(180deg, #0f172a 0%, #16243b 45%, #1b4332 100%)",
    color: "#f8fafc",
    padding: "36px 28px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 28,
  };

  const panelStyle = {
    display: "grid",
    placeItems: "center",
    padding: "24px 20px",
    background:
      "radial-gradient(circle at top right, rgba(22,163,74,0.12), transparent 28%), #f4f5f7",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 520,
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.10)",
    padding: "28px",
    display: "grid",
    gap: 16,
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 15px",
    minHeight: 48,
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#0f172a",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    marginBottom: 8,
    display: "block",
  };

  const primaryButtonStyle = {
    width: "100%",
    padding: "14px 18px",
    minHeight: 48,
    borderRadius: 12,
    border: "1px solid #16a34a",
    background: submitting ? "#86efac" : "#16a34a",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: submitting ? "not-allowed" : "pointer",
    boxShadow: "0 10px 24px rgba(22, 163, 74, 0.18)",
  };

  const secondaryButtonStyle = {
    width: "100%",
    padding: "13px 18px",
    minHeight: 48,
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 600,
    cursor: submitting ? "not-allowed" : "pointer",
  };

  const helperLinkStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: shouldHighlightForgotPassword ? "#166534" : "#15803d",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: shouldHighlightForgotPassword ? 800 : 700,
    padding: shouldHighlightForgotPassword ? "10px 12px" : "0",
    borderRadius: 10,
    background: shouldHighlightForgotPassword ? "#f0fdf4" : "transparent",
    border: shouldHighlightForgotPassword
      ? "1px solid #bbf7d0"
      : "1px solid transparent",
    justifySelf: "start",
    cursor: "pointer",
  };

  const alertBaseStyle = {
    padding: "12px 14px",
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 1.6,
  };

  const passwordChecklist = [
    {
      ok: (resetPasswordForm?.newPassword || "").length >= 12,
      label: t("auth.passwordRuleLength"),
    },
    {
      ok: /[A-Z]/.test(resetPasswordForm?.newPassword || ""),
      label: t("auth.passwordRuleUpper"),
    },
    {
      ok: /[a-z]/.test(resetPasswordForm?.newPassword || ""),
      label: t("auth.passwordRuleLower"),
    },
    {
      ok: /[0-9]/.test(resetPasswordForm?.newPassword || ""),
      label: t("auth.passwordRuleNumber"),
    },
    {
      ok: /[^A-Za-z0-9]/.test(resetPasswordForm?.newPassword || ""),
      label: t("auth.passwordRuleSpecial"),
    },
  ];

  const panelTitle =
    mode === "forgot-password"
      ? t("auth.forgotPassword")
      : mode === "reset-password"
        ? t("auth.resetPasswordTitle")
        : mode === "register"
          ? t("auth.createAccount")
        : mode === "verify-email"
          ? t("auth.checkYourEmail")
          : t("auth.welcomeBack");

  const panelDescription =
    mode === "forgot-password"
      ? t("auth.forgotPasswordDesc")
      : mode === "reset-password"
        ? t("auth.resetPasswordDesc")
        : mode === "register"
          ? t("auth.createAccountDesc")
        : mode === "verify-email"
          ? t("auth.verificationSentTo", { email: pendingEmail || "..." })
          : t("auth.signInDesc");

  return (
    <div className="cf-access-shell" style={shellStyle}>
      <aside style={sidebarStyle} className="cf-access-sidebar">
        <div style={{ display: "grid", gap: 28 }} className="cf-access-sidebar-content">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }} className="cf-access-brand">
            <div
              className="cf-access-brand-mark"
              aria-hidden="true"
            >
              <span className="cf-logo-bar" />
              <span className="cf-logo-dot" />
            </div>
            <div>
              <div
                className="cf-access-brand-title"
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                }}
              >
                FieldBase
              </div>
              <div className="cf-access-brand-subtitle" style={{ fontSize: 13, color: "rgba(248,250,252,0.74)" }}>
                Secure access for your field operations
              </div>
            </div>
          </div>

          <div
            className="cf-access-hero-card"
            style={{
              padding: 20,
              borderRadius: 18,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
              Keep your crew, jobs, invoices, and client data protected.
            </div>
            <div
              style={{
                fontSize: 14,
                color: "rgba(248,250,252,0.76)",
                lineHeight: 1.7,
              }}
            >
              Password recovery, verification, and sign-in all stay inside the
              same branded FieldBase access layer.
            </div>
          </div>
        </div>

        <div
          className="cf-access-security-card"
          style={{
            padding: 18,
            borderRadius: 16,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.07)",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#86efac",
            }}
          >
            Security
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(248,250,252,0.76)",
              lineHeight: 1.7,
            }}
          >
            Rate-limited sign-in and password recovery protect against
            credential stuffing and account enumeration.
          </div>
        </div>
      </aside>

      <main style={panelStyle} className="cf-access-main">
        <div style={cardStyle} className={`cf-access-card cf-access-card--${mode}`}>
          <div className="cf-access-mobile-brand" aria-hidden="true">
            <div className="cf-access-mobile-brand-mark">
              <span className="cf-logo-bar" />
              <span className="cf-logo-dot" />
            </div>
            <div className="cf-access-mobile-brand-text">FieldBase</div>
          </div>

          <div style={{ display: "grid", gap: 8 }} className="cf-access-header">
            <div
              className="cf-access-badge"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                width: "fit-content",
                padding: "8px 12px",
                borderRadius: 999,
                background: "#f0fdf4",
                color: "#166534",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              FieldBase Access
            </div>
            <h1
              className="cf-access-title"
              style={{
                margin: 0,
                fontSize: 32,
                lineHeight: 1.05,
                letterSpacing: "-0.04em",
                color: "#0f172a",
              }}
            >
              {panelTitle}
            </h1>
            <p
              className="cf-access-description"
              style={{
                margin: 0,
                color: "#64748b",
                lineHeight: 1.7,
                fontSize: 15,
              }}
            >
              {panelDescription}
            </p>
          </div>

          {mode === "login"
            ? <form
                className="cf-access-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitLogin();
                }}
                style={{ display: "grid", gap: 16 }}
              >
                <div>
                  <label htmlFor="login-email" style={labelStyle}>
                    {t("auth.emailPlaceholder")}
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={loginForm?.email || ""}
                    onChange={(event) =>
                      onLoginFormChange({
                        ...loginForm,
                        email: event.target.value,
                      })
                    }
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="login-password" style={labelStyle}>
                    {t("auth.passwordPlaceholder")}
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={loginForm?.password || ""}
                    onChange={(event) =>
                      onLoginFormChange({
                        ...loginForm,
                        password: event.target.value,
                      })
                    }
                    placeholder={t("auth.passwordPlaceholder")}
                    required
                    style={inputStyle}
                  />
                </div>

                <button
                  type="button"
                  onClick={onShowForgotPassword}
                  style={helperLinkStyle}
                >
                  {t("auth.forgotPassword")}
                </button>

                {shouldHighlightForgotPassword
                  ? <div
                      style={{
                        ...alertBaseStyle,
                        ...cardAlertStyles("notice"),
                      }}
                    >
                      {t("auth.tooManyFailedAttemptsHint")}
                    </div>
                  : null}

                {error
                  ? <div
                      style={{ ...alertBaseStyle, ...cardAlertStyles("error") }}
                    >
                      {error}
                    </div>
                  : null}
                {notice
                  ? <div
                      style={{
                        ...alertBaseStyle,
                        ...cardAlertStyles("notice"),
                      }}
                    >
                      {notice}
                    </div>
                  : null}

                <button
                  type="submit"
                  disabled={submitting}
                  style={primaryButtonStyle}
                >
                  {submitting ? t("auth.signingIn") : t("auth.signIn")}
                </button>

                <button
                  type="button"
                  onClick={onShowRegister}
                  style={secondaryButtonStyle}
                >
                  {t("auth.createAccountTab")}
                </button>
              </form>
            : null}

          {mode === "register"
            ? <form
              className="cf-access-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitRegister();
                }}
                style={{ display: "grid", gap: 16 }}
              >
                <div>
                  <label htmlFor="register-name" style={labelStyle}>
                    {t("auth.fullNamePlaceholder")}
                  </label>
                  <input
                    id="register-name"
                    type="text"
                    autoComplete="name"
                    value={registerForm?.name || ""}
                    onChange={(event) =>
                      onRegisterFormChange({
                        ...registerForm,
                        name: event.target.value,
                      })
                    }
                    placeholder={t("auth.fullNamePlaceholder")}
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="register-company" style={labelStyle}>
                    {t("auth.companyNamePlaceholder")}
                  </label>
                  <input
                    id="register-company"
                    type="text"
                    autoComplete="organization"
                    value={registerForm?.companyName || ""}
                    onChange={(event) =>
                      onRegisterFormChange({
                        ...registerForm,
                        companyName: event.target.value,
                      })
                    }
                    placeholder={t("auth.companyNamePlaceholder")}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="register-email" style={labelStyle}>
                    {t("auth.emailPlaceholder")}
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    autoComplete="email"
                    value={registerForm?.email || ""}
                    onChange={(event) =>
                      onRegisterFormChange({
                        ...registerForm,
                        email: event.target.value,
                      })
                    }
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="register-password" style={labelStyle}>
                    {t("auth.passwordPlaceholder")}
                  </label>
                  <input
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    value={registerForm?.password || ""}
                    onChange={(event) =>
                      onRegisterFormChange({
                        ...registerForm,
                        password: event.target.value,
                      })
                    }
                    placeholder={t("auth.passwordPlaceholder")}
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="register-industry" style={labelStyle}>
                    {t("auth.industryPlaceholder")}
                  </label>
                  <select
                    id="register-industry"
                    value={registerForm?.industry || "landscaping_hardscaping"}
                    onChange={(event) =>
                      onRegisterFormChange({
                        ...registerForm,
                        industry: event.target.value,
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="landscaping_hardscaping">{t("auth.industries.landscapingHardscaping")}</option>
                    <option value="cleaning">{t("auth.industries.cleaning")}</option>
                    <option value="construction">{t("auth.industries.construction")}</option>
                    <option value="general_contractor">{t("auth.industries.generalContractor")}</option>
                    <option value="electrical">{t("auth.industries.electrical")}</option>
                    <option value="hvac">{t("auth.industries.hvac")}</option>
                    <option value="handyman">{t("auth.industries.handyman")}</option>
                    <option value="painting">{t("auth.industries.painting")}</option>
                    <option value="plumbing">{t("auth.industries.plumbing")}</option>
                    <option value="roofing">{t("auth.industries.roofing")}</option>
                    <option value="tree_care">{t("auth.industries.treeCare")}</option>
                    <option value="other">{t("auth.industries.other")}</option>
                  </select>
                </div>

                {error
                  ? <div
                      style={{ ...alertBaseStyle, ...cardAlertStyles("error") }}
                    >
                      {error}
                    </div>
                  : null}
                {notice
                  ? <div
                      style={{
                        ...alertBaseStyle,
                        ...cardAlertStyles("notice"),
                      }}
                    >
                      {notice}
                    </div>
                  : null}

                <button
                  type="submit"
                  disabled={submitting}
                  style={primaryButtonStyle}
                >
                  {submitting ? t("auth.creatingAccount") : t("auth.createAccountBtn")}
                </button>

                <button
                  type="button"
                  onClick={onBackToLogin}
                  style={secondaryButtonStyle}
                >
                  {t("auth.backToLogin")}
                </button>
              </form>
            : null}

          {mode === "forgot-password"
            ? <form
              className="cf-access-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitForgotPassword();
                }}
                style={{ display: "grid", gap: 16 }}
              >
                <div>
                  <label htmlFor="forgot-password-email" style={labelStyle}>
                    {t("auth.emailPlaceholder")}
                  </label>
                  <input
                    id="forgot-password-email"
                    type="email"
                    autoComplete="email"
                    value={forgotPasswordEmail || ""}
                    onChange={(event) =>
                      onForgotPasswordEmailChange(event.target.value)
                    }
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    style={inputStyle}
                  />
                </div>

                {error
                  ? <div
                      style={{ ...alertBaseStyle, ...cardAlertStyles("error") }}
                    >
                      {error}
                    </div>
                  : null}
                {notice
                  ? <div
                      style={{
                        ...alertBaseStyle,
                        ...cardAlertStyles("notice"),
                      }}
                    >
                      {notice}
                    </div>
                  : null}

                <button
                  type="submit"
                  disabled={submitting}
                  style={primaryButtonStyle}
                >
                  {submitting ? t("auth.sending") : t("auth.sendResetLink")}
                </button>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  style={secondaryButtonStyle}
                >
                  {t("auth.backToLogin")}
                </button>
              </form>
            : null}

          {mode === "reset-password"
            ? <form
              className="cf-access-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitResetPassword();
                }}
                style={{ display: "grid", gap: 16 }}
              >
                <div>
                  <label htmlFor="reset-new-password" style={labelStyle}>
                    {t("auth.newPassword")}
                  </label>
                  <input
                    id="reset-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={resetPasswordForm?.newPassword || ""}
                    onChange={(event) =>
                      onResetPasswordFormChange({
                        ...resetPasswordForm,
                        newPassword: event.target.value,
                      })
                    }
                    placeholder={t("auth.newPassword")}
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label htmlFor="reset-confirm-password" style={labelStyle}>
                    {t("auth.confirmPassword")}
                  </label>
                  <input
                    id="reset-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={resetPasswordForm?.confirmPassword || ""}
                    onChange={(event) =>
                      onResetPasswordFormChange({
                        ...resetPasswordForm,
                        confirmPassword: event.target.value,
                      })
                    }
                    placeholder={t("auth.confirmPassword")}
                    required
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: passwordStrong
                      ? "1px solid #bbf7d0"
                      : "1px solid #e5e7eb",
                    background: passwordStrong ? "#f0fdf4" : "#f8fafc",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#334155",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {t("auth.passwordStrengthTitle")}
                  </div>
                  {passwordChecklist.map((rule) => (
                    <div
                      key={rule.label}
                      style={{
                        fontSize: 13,
                        color: rule.ok ? "#166534" : "#64748b",
                        fontWeight: rule.ok ? 700 : 500,
                      }}
                    >
                      {rule.ok ? "✓" : "•"} {rule.label}
                    </div>
                  ))}
                </div>

                {error
                  ? <div
                      style={{ ...alertBaseStyle, ...cardAlertStyles("error") }}
                    >
                      {error}
                    </div>
                  : null}
                {notice
                  ? <div
                      style={{
                        ...alertBaseStyle,
                        ...cardAlertStyles("notice"),
                      }}
                    >
                      {notice}
                    </div>
                  : null}

                <button
                  type="submit"
                  disabled={submitting}
                  style={primaryButtonStyle}
                >
                  {submitting ? t("auth.sending") : t("auth.updatePassword")}
                </button>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  style={secondaryButtonStyle}
                >
                  {t("auth.backToLogin")}
                </button>
              </form>
            : null}

          {mode === "verify-email"
            ? <div style={{ display: "grid", gap: 16 }}>
                {error
                  ? <div
                      style={{ ...alertBaseStyle, ...cardAlertStyles("error") }}
                    >
                      {error}
                    </div>
                  : null}
                {notice
                  ? <div
                      style={{
                        ...alertBaseStyle,
                        ...cardAlertStyles("notice"),
                      }}
                    >
                      {notice}
                    </div>
                  : null}

                <button
                  type="button"
                  disabled={submitting}
                  onClick={onResendVerification}
                  style={primaryButtonStyle}
                >
                  {submitting
                    ? t("auth.sending")
                    : t("auth.resendVerification")}
                </button>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  style={secondaryButtonStyle}
                >
                  {t("auth.backToLogin")}
                </button>
              </div>
            : null}
        </div>

        <style>{`
          .cf-access-shell {
            grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
          }

          @media (max-width: 920px) {
            .cf-access-shell {
              grid-template-columns: 1fr;
            }

            .cf-access-sidebar {
              justify-content: flex-start;
            }
          }

          .cf-access-brand-mark {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            background: linear-gradient(145deg, #0d4fd9 0%, #091220 100%);
            position: relative;
            flex-shrink: 0;
          }

          @media (max-width: 768px) {
            .cf-access-shell {
              min-height: 100dvh;
              grid-template-columns: 1fr !important;
            }

            .cf-access-sidebar {
              display: none !important;
            }

            .cf-access-sidebar-content {
              gap: 12px;
            }

            .cf-access-brand-mark {
              width: 36px !important;
              height: 36px !important;
              border-radius: 10px !important;
            }

            .cf-access-brand-title {
              font-size: 17px !important;
            }

            .cf-access-brand-subtitle {
              font-size: 12px !important;
            }

            .cf-access-hero-card {
              padding: 12px !important;
              gap: 8px !important;
            }

            .cf-access-hero-card > div:first-child {
              font-size: 18px !important;
              line-height: 1.25 !important;
            }

            .cf-access-hero-card > div:last-child {
              display: none;
            }

            .cf-access-security-card {
              display: none !important;
            }

            .cf-access-main {
              padding: 16px;
              min-height: 100dvh;
              align-items: center;
              overflow: visible;
              width: 100%;
            }

            .cf-access-card {
              width: 100%;
              max-width: 100% !important;
              border-radius: 18px;
              padding: 20px 16px;
              gap: 14px;
              box-sizing: border-box;
            }

            .cf-access-mobile-brand {
              display: flex;
              align-items: center;
              gap: 10px;
            }

            .cf-access-mobile-brand-mark {
              width: 36px;
              height: 36px;
              border-radius: 12px;
              background: linear-gradient(145deg, #0d4fd9 0%, #091220 100%);
              position: relative;
              flex-shrink: 0;
            }

            .cf-logo-bar {
              position: absolute;
              left: 8px;
              top: 11px;
              width: 20px;
              height: 7px;
              border-radius: 999px;
              background: linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.18) 100%);
            }

            .cf-logo-dot {
              position: absolute;
              right: 8px;
              bottom: 8px;
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: #f59e0b;
            }

            .cf-access-mobile-brand-text {
              font-size: 15px;
              font-weight: 800;
              color: #0f172a;
              letter-spacing: -0.02em;
            }

            .cf-access-header {
              gap: 6px !important;
            }

            .cf-access-badge {
              font-size: 11px !important;
              padding: 6px 10px !important;
            }

            .cf-access-title {
              font-size: 26px !important;
              line-height: 1.12 !important;
              letter-spacing: -0.03em !important;
            }

            .cf-access-description {
              font-size: 14px !important;
              line-height: 1.5 !important;
              max-width: 36ch;
            }

            .cf-access-form {
              gap: 12px !important;
              width: 100%;
              overflow: visible;
            }

            .cf-access-form button {
              width: 100%;
              overflow: visible;
            }
          }

          @media (max-width: 390px) {
            .cf-access-main {
              padding: 14px;
            }

            .cf-access-card {
              padding: 18px 14px;
            }

            .cf-access-title {
              font-size: 24px !important;
            }

            .cf-access-badge {
              display: none !important;
            }

            .cf-access-card--register .cf-access-header {
              gap: 4px !important;
            }

            .cf-access-card--register .cf-access-title {
              font-size: 22px !important;
            }

            .cf-access-card--register .cf-access-description {
              display: none;
            }

            .cf-access-card--register .cf-access-form {
              gap: 10px !important;
            }

            .cf-access-card--register label {
              margin-bottom: 6px !important;
              font-size: 12px !important;
            }

            .cf-access-card--register input,
            .cf-access-card--register select,
            .cf-access-card--register button {
              min-height: 44px !important;
            }
          }

          @media (min-width: 769px) {
            .cf-access-mobile-brand {
              display: none;
            }
          }
        `}</style>
      </main>
    </div>
  );
}
