export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

export function normalizeMoneyInput(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
}
