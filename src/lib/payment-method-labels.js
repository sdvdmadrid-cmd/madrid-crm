/**
 * Shared display helpers for saved Stripe / Plaid payment methods.
 */

export function formatPaymentMethodLabel(method) {
  if (!method) return "Payment method";
  if (method.methodLabel) return method.methodLabel;

  const type = String(method.methodType || "card").toLowerCase();
  const brand = method.brand || method.bankName || "";
  const last4 = method.last4 ? `•••• ${method.last4}` : "";

  if (type === "bank_account" || method.provider === "plaid") {
    return [method.bankName || "Bank account", last4].filter(Boolean).join(" ");
  }

  return [brand, last4].filter(Boolean).join(" ") || "Card";
}

export function paymentMethodIcon(method) {
  const type = String(method?.methodType || "card").toLowerCase();
  if (method?.provider === "plaid" || type === "bank_account") return "🏦";
  const brand = String(method?.brand || "").toLowerCase();
  if (brand.includes("visa")) return "💳";
  if (brand.includes("master")) return "💳";
  if (brand.includes("amex")) return "💳";
  return "💳";
}

export function formatExpiry(method) {
  if (!method?.expMonth || !method?.expYear) return null;
  const month = String(method.expMonth).padStart(2, "0");
  const year = String(method.expYear).slice(-2);
  return `${month}/${year}`;
}
