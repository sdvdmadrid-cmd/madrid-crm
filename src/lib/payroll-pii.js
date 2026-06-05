import "server-only";

import {
  decryptSensitive,
  encryptSensitive,
  isValidEncryptedFormat,
} from "./encryption.js";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeSsnInput(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 9) return null;
  return digits;
}

export function maskSsnLast4(ssn) {
  const digits = digitsOnly(ssn);
  if (digits.length < 4) return "";
  return digits.slice(-4);
}

export function encryptSsn(ssn) {
  const normalized = normalizeSsnInput(ssn);
  if (!normalized) return { encrypted: "", last4: "" };
  return {
    encrypted: encryptSensitive(normalized),
    last4: normalized.slice(-4),
  };
}

export function decryptSsnIfNeeded(encrypted) {
  if (!encrypted) return "";
  if (!isValidEncryptedFormat(encrypted)) return "";
  try {
    return decryptSensitive(encrypted);
  } catch {
    return "";
  }
}

export function encryptDirectDeposit(payload = {}) {
  const routing = digitsOnly(payload.routingNumber);
  const account = digitsOnly(payload.accountNumber);
  if (!routing || !account) {
    return { encrypted: "", last4: "" };
  }
  const blob = JSON.stringify({
    routingNumber: routing,
    accountNumber: account,
    accountType: String(payload.accountType || "checking"),
  });
  return {
    encrypted: encryptSensitive(blob),
    last4: account.slice(-4),
  };
}

export function decryptDirectDepositIfNeeded(encrypted) {
  if (!encrypted || !isValidEncryptedFormat(encrypted)) return null;
  try {
    const raw = decryptSensitive(encrypted);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function canUsePayrollEncryption() {
  try {
    const keyHex = process.env.ENCRYPTION_KEY;
    return Boolean(keyHex && keyHex.length === 64);
  } catch {
    return false;
  }
}
