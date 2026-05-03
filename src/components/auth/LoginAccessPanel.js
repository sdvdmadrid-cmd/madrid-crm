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
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
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
    padding: "32px 20px",
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
    padding: "32px",
    display: "grid",
    gap: 18,
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 15px",
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
      <aside style={sidebarStyle}>
        <div style={{ display: "grid", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: "#16a34a",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              FB
            </div>
            <div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                }}
              >
                FieldBase
              </div>
              <div style={{ fontSize: 13, color: "rgba(248,250,252,0.74)" }}>
                Secure access for your field operations
              </div>
            </div>
          </div>

          <div
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

      <main style={panelStyle}>
        <div style={cardStyle}>
          <div style={{ display: "grid", gap: 8 }}>
            <div
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
          @media (max-width: 920px) {
            .cf-access-shell {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </main>
    </div>
  );
}
