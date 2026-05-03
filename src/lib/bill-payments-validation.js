export const BILL_ACCOUNT_NUMBER_MIN_LENGTH = 4;
export const BILL_ACCOUNT_NUMBER_MAX_LENGTH = 25;

const BILL_ACCOUNT_NUMBER_ALLOWED_CHARS = /^\d+$/;

export function normalizeBillAccountNumber(value) {
  return String(value || "")
    .trim();
}

export function getComparableBillAccountNumber(value) {
  return normalizeBillAccountNumber(value);
}

export function isValidBillAccountNumber(value) {
  const normalized = normalizeBillAccountNumber(value);
  if (!normalized) return true;
  if (!BILL_ACCOUNT_NUMBER_ALLOWED_CHARS.test(normalized)) return false;

  const comparable = getComparableBillAccountNumber(normalized);
  return (
    comparable.length >= BILL_ACCOUNT_NUMBER_MIN_LENGTH &&
    comparable.length <= BILL_ACCOUNT_NUMBER_MAX_LENGTH
  );
}

export function getBillAccountNumberError(value) {
  const normalized = normalizeBillAccountNumber(value);
  if (!normalized) return "";

  if (!BILL_ACCOUNT_NUMBER_ALLOWED_CHARS.test(normalized)) {
    return "Account number must contain digits only";
  }

  const comparable = getComparableBillAccountNumber(normalized);
  if (comparable.length < BILL_ACCOUNT_NUMBER_MIN_LENGTH) {
    return `Account number must be at least ${BILL_ACCOUNT_NUMBER_MIN_LENGTH} digits`;
  }
  if (comparable.length > BILL_ACCOUNT_NUMBER_MAX_LENGTH) {
    return `Account number must be ${BILL_ACCOUNT_NUMBER_MAX_LENGTH} digits or fewer`;
  }

  return "";
}