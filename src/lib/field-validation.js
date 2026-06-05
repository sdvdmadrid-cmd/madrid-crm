/**
 * Shared client + server field validation (pure functions).
 */

import {
  isValidEmailFormat,
  isValidPhoneFormat,
} from "./import-engine/client-import-validate.js";

export { isValidEmailFormat, isValidPhoneFormat };

export function parseMoneyInput(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function isPositiveMoney(value) {
  const n = parseMoneyInput(value);
  return Number.isFinite(n) && n >= 0;
}

export function requireNonEmptyString(value, fieldLabel = "Field") {
  const s = String(value || "").trim();
  if (!s) return `${fieldLabel} is required.`;
  return "";
}

export function validateContactFields({ email = "", phone = "", requireEmail = false } = {}) {
  const errors = {};
  const emailTrim = String(email || "").trim();
  const phoneTrim = String(phone || "").trim();

  if (requireEmail && !emailTrim) {
    errors.email = "Email is required.";
  } else if (emailTrim && !isValidEmailFormat(emailTrim)) {
    errors.email = "Enter a valid email address.";
  }

  if (phoneTrim && !isValidPhoneFormat(phoneTrim)) {
    errors.phone = "Enter a valid phone number (7–15 digits).";
  }

  return errors;
}
