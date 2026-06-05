const HOURS_PER_YEAR = 2080;

export function computePayPreview(payType, hourlyRate, annualSalary) {
  const hourly = Number(hourlyRate || 0);
  const salary = Number(annualSalary || 0);
  const grossAnnual =
    String(payType || "hourly").toLowerCase() === "salary"
      ? salary
      : hourly * HOURS_PER_YEAR;

  return {
    grossAnnual: roundMoney(grossAnnual),
    weekly: roundMoney(grossAnnual / 52),
    biweekly: roundMoney(grossAnnual / 26),
  };
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}
