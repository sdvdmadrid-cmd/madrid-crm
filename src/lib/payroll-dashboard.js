import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { roundMoney } from "./payroll-money.js";
import { serializePayrollRun } from "./payroll-serializer.js";
import { supabaseAdmin } from "./supabase-admin.js";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return isoDate(d);
}

function startOfMonth(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function sumRunTotals(runs = []) {
  const out = {
    grossPay: 0,
    netPay: 0,
    employerTaxes: 0,
    federalWithholding: 0,
    stateWithholding: 0,
    socialSecurity: 0,
    medicare: 0,
    runCount: runs.length,
  };

  for (const run of runs) {
    const t = run.totals || {};
    out.grossPay += Number(t.grossPay || 0);
    out.netPay += Number(t.netPay || 0);
    out.employerTaxes += Number(t.employerTaxes || 0);
    out.federalWithholding += Number(t.federalWithholding || 0);
    out.stateWithholding += Number(t.stateWithholding || 0);
    out.socialSecurity += Number(t.socialSecurity || 0);
    out.medicare += Number(t.medicare || 0);
  }

  for (const key of Object.keys(out)) {
    if (key !== "runCount") out[key] = roundMoney(out[key]);
  }
  return out;
}

export async function getPayrollDashboardMetrics(tenantDbId) {
  const today = isoDate(new Date());
  const weekStart = startOfWeek(new Date());
  const monthStart = startOfMonth(new Date());
  const finalizedStatuses = ["approved", "finalized"];

  const [
    employeeCountRes,
    weekRunsRes,
    monthRunsRes,
    upcomingRunsRes,
    draftRunsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from(PAYROLL_TABLES.EMPLOYEES)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantDbId)
      .eq("status", "active"),
    supabaseAdmin
      .from(PAYROLL_TABLES.RUNS)
      .select("totals")
      .eq("tenant_id", tenantDbId)
      .in("status", finalizedStatuses)
      .gte("pay_date", weekStart)
      .lte("pay_date", today),
    supabaseAdmin
      .from(PAYROLL_TABLES.RUNS)
      .select("totals")
      .eq("tenant_id", tenantDbId)
      .in("status", finalizedStatuses)
      .gte("pay_date", monthStart)
      .lte("pay_date", today),
    supabaseAdmin
      .from(PAYROLL_TABLES.RUNS)
      .select("*")
      .eq("tenant_id", tenantDbId)
      .in("status", ["draft", "calculated"])
      .gte("pay_date", today)
      .order("pay_date", { ascending: true })
      .limit(5),
    supabaseAdmin
      .from(PAYROLL_TABLES.RUNS)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantDbId)
      .in("status", ["draft", "calculated"]),
  ]);

  const weekTotals = sumRunTotals(weekRunsRes.data || []);
  const monthTotals = sumRunTotals(monthRunsRes.data || []);

  return {
    employeeCount: employeeCountRes.count || 0,
    pendingRunCount: draftRunsRes.count || 0,
    thisWeek: weekTotals,
    thisMonth: monthTotals,
    employerTaxLiability: monthTotals.employerTaxes,
    upcomingRuns: (upcomingRunsRes.data || []).map(serializePayrollRun),
    generatedAt: new Date().toISOString(),
  };
}
