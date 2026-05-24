/** Shared Stripe Connect / payments rollout codes (safe for client + server). */

export const PAYMENTS_MODE = {
  PLATFORM: "platform",
  CONNECT: "connect",
};

export const CONNECT_ERROR_CODE = {
  NOT_ENABLED: "connect_not_enabled",
  PLATFORM_NOT_ENABLED: "platform_connect_not_enabled",
  NOT_CONFIGURED: "connect_not_configured",
  PAYOUT_REQUIRED: "connect_payout_required",
};
