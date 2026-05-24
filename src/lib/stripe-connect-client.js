import { CONNECT_ERROR_CODE } from "@/lib/stripe-connect-codes";

/**
 * Maps Connect API errors to user-facing copy (no internal doc paths for contractors).
 */
export function resolveConnectOnboardError(err, t, { isPlatformOwner = false } = {}) {
  const code = String(err?.code || "").trim();
  const raw = String(err?.message || "");

  if (
    code === CONNECT_ERROR_CODE.PLATFORM_NOT_ENABLED ||
    raw.includes("STRIPE_CONNECT_PLATFORM_NOT_ENABLED")
  ) {
    return isPlatformOwner
      ? t("settingsPayments.errors.platformConnectRequiredOwner")
      : t("settingsPayments.errors.platformConnectRequired");
  }

  if (code === CONNECT_ERROR_CODE.NOT_ENABLED) {
    return t("settingsPayments.errors.connectNotEnabledYet");
  }

  return raw || t("settingsPayments.errors.onboard");
}
