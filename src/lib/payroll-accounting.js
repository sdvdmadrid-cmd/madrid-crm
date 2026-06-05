import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { roundMoney } from "./payroll-money.js";
import { supabaseAdmin } from "./supabase-admin.js";

function buildJournalEntry({ run, item, employee, periodDate }) {
  const gross = Number(item.gross_pay || 0);
  const employerTax = Number(item.employer_taxes?.total || 0);
  const laborBurden = roundMoney(gross + employerTax);

  return {
    date: periodDate,
    description: `Payroll — ${employee?.first_name || ""} ${employee?.last_name || ""}`.trim(),
    lines: [
      { account: "6100-Labor Expense", debit: gross, credit: 0 },
      { account: "6110-Payroll Tax Expense", debit: employerTax, credit: 0 },
      { account: "2100-Payroll Liability", debit: 0, credit: roundMoney(gross - Number(item.net_pay || 0)) },
      { account: "2110-Payroll Tax Payable", debit: 0, credit: employerTax },
      { account: "2120-Net Pay Payable", debit: 0, credit: Number(item.net_pay || 0) },
    ],
    laborBurden,
  };
}

export async function createPayrollExpenseRecordsForRun({ tenantDbId, runId }) {
  const { data: run, error: runError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUNS)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .eq("id", runId)
    .maybeSingle();

  if (runError) throw new Error(runError.message);
  if (!run) throw new Error("Pay run not found");
  if (run.status !== "finalized") return { created: 0 };

  const { data: existing } = await supabaseAdmin
    .from("payroll_expense_records")
    .select("id")
    .eq("run_id", runId)
    .limit(1);

  if (existing?.length) return { created: 0, skipped: true };

  const { data: items, error: itemsError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("*, payroll_employees(first_name, last_name)")
    .eq("run_id", runId);

  if (itemsError) throw new Error(itemsError.message);

  const periodDate = run.pay_date;
  const rows = [];

  for (const item of items || []) {
    const gross = Number(item.gross_pay || 0);
    const employerTax = Number(item.employer_taxes?.total || 0);
    const laborBurden = roundMoney(gross + employerTax);

    rows.push({
      tenant_id: tenantDbId,
      run_id: runId,
      run_item_id: item.id,
      job_id: item.job_id || null,
      employee_id: item.employee_id,
      expense_type: run.run_type === "correction" ? "correction" : "labor",
      gross_amount: gross,
      employer_tax_amount: employerTax,
      labor_burden: laborBurden,
      journal_entry: buildJournalEntry({
        run,
        item,
        employee: item.payroll_employees,
        periodDate,
      }),
      period_date: periodDate,
      created_at: new Date().toISOString(),
    });
  }

  if (!rows.length) return { created: 0 };

  const { error: insertError } = await supabaseAdmin
    .from("payroll_expense_records")
    .insert(rows);

  if (insertError) throw new Error(insertError.message);

  return { created: rows.length };
}

export async function getPayrollPlSummary({ tenantDbId, startDate, endDate, jobId }) {
  let query = supabaseAdmin
    .from("payroll_expense_records")
    .select("gross_amount, employer_tax_amount, labor_burden")
    .eq("tenant_id", tenantDbId)
    .gte("period_date", startDate)
    .lte("period_date", endDate);

  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const summary = {
    grossLabor: 0,
    employerTaxes: 0,
    laborBurden: 0,
    lineCount: (data || []).length,
  };

  for (const row of data || []) {
    summary.grossLabor += Number(row.gross_amount || 0);
    summary.employerTaxes += Number(row.employer_tax_amount || 0);
    summary.laborBurden += Number(row.labor_burden || 0);
  }

  summary.grossLabor = roundMoney(summary.grossLabor);
  summary.employerTaxes = roundMoney(summary.employerTaxes);
  summary.laborBurden = roundMoney(summary.laborBurden);

  return summary;
}
