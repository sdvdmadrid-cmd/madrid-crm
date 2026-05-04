import "server-only";

const TEST_EMAIL_DOMAINS = new Set(["example.com"]);

export function getSenderAddress(value) {
  const input = String(value || "").trim();
  const match = input.match(/<([^>]+)>/);
  return (match?.[1] || input).trim().toLowerCase();
}

export function getSenderDomain(value) {
  const address = getSenderAddress(value);
  const atIndex = address.lastIndexOf("@");
  if (atIndex === -1) return "";
  return address.slice(atIndex + 1).trim().toLowerCase();
}

function isLocalAppUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(
    String(value || "").trim(),
  );
}

export function getProductionReadinessIssues() {
  if (process.env.NODE_ENV !== "production") {
    return [];
  }

  const issues = [];
  const appUrl = String(process.env.APP_URL || "").trim();
  const appBaseUrl = String(process.env.APP_BASE_URL || "").trim();
  const emailProvider = String(process.env.EMAIL_PROVIDER || "mock")
    .trim()
    .toLowerCase();
  const emailFrom = String(process.env.EMAIL_FROM || "").trim();
  const emailDomain = getSenderDomain(emailFrom);
  const devLoginEnabled =
    String(process.env.DEV_LOGIN_ENABLED || "false").toLowerCase() === "true";
  const publicDevLoginEnabled =
    String(process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED || "false").toLowerCase() ===
    "true";

  if (!appUrl) {
    issues.push("APP_URL must be configured in production");
  } else if (isLocalAppUrl(appUrl)) {
    issues.push("APP_URL cannot point to localhost in production");
  }

  if (!appBaseUrl) {
    issues.push("APP_BASE_URL must be configured in production");
  } else if (isLocalAppUrl(appBaseUrl)) {
    issues.push("APP_BASE_URL cannot point to localhost in production");
  }

  if (emailProvider === "resend") {
    if (!emailFrom) {
      issues.push("EMAIL_FROM must be configured when EMAIL_PROVIDER=resend");
    } else if (TEST_EMAIL_DOMAINS.has(emailDomain)) {
      issues.push(
        "EMAIL_FROM must use a verified non-test sending domain in production",
      );
    }
  }

  if (devLoginEnabled || publicDevLoginEnabled) {
    issues.push(
      "DEV_LOGIN_ENABLED and NEXT_PUBLIC_DEV_LOGIN_ENABLED must both be false in production",
    );
  }

  return issues;
}

export function assertProductionReadiness() {
  const issues = getProductionReadinessIssues();
  if (issues.length === 0) {
    return;
  }

  throw new Error(
    `Production configuration invalid:\n- ${issues.join("\n- ")}`,
  );
}

export function isTestEmailDomain(value) {
  return TEST_EMAIL_DOMAINS.has(getSenderDomain(value));
}