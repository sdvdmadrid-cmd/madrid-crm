export const US_STATE_OPTIONS = [
  { code: "AL", name: "Alabama", taxRate: 4.0 },
  { code: "AK", name: "Alaska", taxRate: 0.0 },
  { code: "AZ", name: "Arizona", taxRate: 5.6 },
  { code: "AR", name: "Arkansas", taxRate: 6.5 },
  { code: "CA", name: "California", taxRate: 7.25 },
  { code: "CO", name: "Colorado", taxRate: 2.9 },
  { code: "CT", name: "Connecticut", taxRate: 6.35 },
  { code: "DE", name: "Delaware", taxRate: 0.0 },
  { code: "FL", name: "Florida", taxRate: 6.0 },
  { code: "GA", name: "Georgia", taxRate: 4.0 },
  { code: "HI", name: "Hawaii", taxRate: 4.0 },
  { code: "ID", name: "Idaho", taxRate: 6.0 },
  { code: "IL", name: "Illinois", taxRate: 6.25 },
  { code: "IN", name: "Indiana", taxRate: 7.0 },
  { code: "IA", name: "Iowa", taxRate: 6.0 },
  { code: "KS", name: "Kansas", taxRate: 6.5 },
  { code: "KY", name: "Kentucky", taxRate: 6.0 },
  { code: "LA", name: "Louisiana", taxRate: 4.45 },
  { code: "ME", name: "Maine", taxRate: 5.5 },
  { code: "MD", name: "Maryland", taxRate: 6.0 },
  { code: "MA", name: "Massachusetts", taxRate: 6.25 },
  { code: "MI", name: "Michigan", taxRate: 6.0 },
  { code: "MN", name: "Minnesota", taxRate: 6.875 },
  { code: "MS", name: "Mississippi", taxRate: 7.0 },
  { code: "MO", name: "Missouri", taxRate: 4.225 },
  { code: "MT", name: "Montana", taxRate: 0.0 },
  { code: "NE", name: "Nebraska", taxRate: 5.5 },
  { code: "NV", name: "Nevada", taxRate: 6.85 },
  { code: "NH", name: "New Hampshire", taxRate: 0.0 },
  { code: "NJ", name: "New Jersey", taxRate: 6.625 },
  { code: "NM", name: "New Mexico", taxRate: 5.125 },
  { code: "NY", name: "New York", taxRate: 4.0 },
  { code: "NC", name: "North Carolina", taxRate: 4.75 },
  { code: "ND", name: "North Dakota", taxRate: 5.0 },
  { code: "OH", name: "Ohio", taxRate: 5.75 },
  { code: "OK", name: "Oklahoma", taxRate: 4.5 },
  { code: "OR", name: "Oregon", taxRate: 0.0 },
  { code: "PA", name: "Pennsylvania", taxRate: 6.0 },
  { code: "RI", name: "Rhode Island", taxRate: 7.0 },
  { code: "SC", name: "South Carolina", taxRate: 6.0 },
  { code: "SD", name: "South Dakota", taxRate: 4.2 },
  { code: "TN", name: "Tennessee", taxRate: 7.0 },
  { code: "TX", name: "Texas", taxRate: 6.25 },
  { code: "UT", name: "Utah", taxRate: 6.1 },
  { code: "VT", name: "Vermont", taxRate: 6.0 },
  { code: "VA", name: "Virginia", taxRate: 5.3 },
  { code: "WA", name: "Washington", taxRate: 6.5 },
  { code: "WV", name: "West Virginia", taxRate: 6.0 },
  { code: "WI", name: "Wisconsin", taxRate: 5.0 },
  { code: "WY", name: "Wyoming", taxRate: 4.0 },
  { code: "DC", name: "District of Columbia", taxRate: 6.0 },
];

const STATE_RATE_MAP = new Map(
  US_STATE_OPTIONS.map((item) => [item.code, item.taxRate]),
);

function toMoney(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Number(parsed.toFixed(2)));
}

function toPercent(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Number(parsed.toFixed(2))));
}

export function getUsStateTaxRate(stateCode) {
  const key = String(stateCode || "")
    .trim()
    .toUpperCase();
  return Number(STATE_RATE_MAP.get(key) || 0);
}

export function getUsStateLabel(stateCode) {
  const key = String(stateCode || "")
    .trim()
    .toUpperCase();
  return (
    US_STATE_OPTIONS.find((item) => item.code === key)?.name || "Unknown state"
  );
}

export function computeEstimateFinancials({
  baseAmount,
  taxState,
  downPaymentPercent,
}) {
  const subtotal = toMoney(baseAmount);
  const normalizedState = String(taxState || "TX")
    .trim()
    .toUpperCase();
  const taxRate = Number(getUsStateTaxRate(normalizedState).toFixed(3));
  const taxAmount = Number((subtotal * (taxRate / 100)).toFixed(2));
  const total = Number((subtotal + taxAmount).toFixed(2));
  const normalizedDownPaymentPercent = toPercent(downPaymentPercent);
  const downPaymentAmount = Number(
    (total * (normalizedDownPaymentPercent / 100)).toFixed(2),
  );
  const balanceAfterDownPayment = Number(
    Math.max(0, total - downPaymentAmount).toFixed(2),
  );

  return {
    subtotal,
    taxState: normalizedState,
    taxRate,
    taxAmount,
    total,
    downPaymentPercent: normalizedDownPaymentPercent,
    downPaymentAmount,
    balanceAfterDownPayment,
  };
}
