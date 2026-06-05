import { roundMoney } from "./payroll-money.js";
import { JOB_EXPENSE_CATEGORIES } from "./job-expense-constants.js";

export function summarizeExpensesByCategory(expenses = []) {
  const byCategory = Object.fromEntries(
    JOB_EXPENSE_CATEGORIES.map((cat) => [cat, 0]),
  );
  let total = 0;

  for (const row of expenses) {
    const cat = row.category || "other";
    const amt = Number(row.amount || 0);
    if (byCategory[cat] != null) byCategory[cat] += amt;
    else byCategory.other += amt;
    total += amt;
  }

  for (const key of Object.keys(byCategory)) {
    byCategory[key] = roundMoney(byCategory[key]);
  }

  return { byCategory, total: roundMoney(total) };
}

export function extractAmountFromReceiptText(text = "") {
  const matches = String(text).match(/\$?\s*([0-9]{1,6}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g);
  if (!matches?.length) return null;
  const values = matches
    .map((m) => Number(m.replace(/[^0-9.]/g, "")))
    .filter((n) => n > 0 && n < 1000000);
  if (!values.length) return null;
  return roundMoney(Math.max(...values));
}
