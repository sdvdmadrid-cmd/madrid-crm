import "server-only";

import { supabaseAdmin } from "./supabase-admin";
import {
  defaultFederalTables,
  jurisdictionForState,
  mergeTaxTablesFromRows,
} from "./payroll-tax-tables.js";
import { PAYROLL_TABLES } from "./payroll-constants.js";

export async function loadPayrollTaxTables({ asOfDate = new Date() } = {}) {
  const asOf =
    asOfDate instanceof Date
      ? asOfDate.toISOString().slice(0, 10)
      : String(asOfDate || "").slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from(PAYROLL_TABLES.TAX_TABLES)
    .select("jurisdiction, table_type, payload, version_label, effective_from")
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false });

  if (error) {
    console.error("[payroll-tax-tables-server] load error", error);
    return {
      ...mergeTaxTablesFromRows([]),
      versionLabel: "fallback-default",
    };
  }

  const latestByKey = new Map();
  for (const row of data || []) {
    const key = `${row.jurisdiction}:${row.table_type}`;
    if (!latestByKey.has(key)) latestByKey.set(key, row);
  }

  const merged = mergeTaxTablesFromRows([...latestByKey.values()]);
  if (!merged.versionLabel) merged.versionLabel = "2026-default";
  return merged;
}

export async function loadStateTaxTableRows(stateCode) {
  const jurisdiction = jurisdictionForState(stateCode);
  const { data } = await supabaseAdmin
    .from(PAYROLL_TABLES.TAX_TABLES)
    .select("*")
    .eq("jurisdiction", jurisdiction)
    .eq("table_type", "state_withholding")
    .order("effective_from", { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

export function fallbackTaxTables() {
  return mergeTaxTablesFromRows([
    {
      jurisdiction: "US-FED",
      table_type: "federal_withholding",
      version_label: "fallback",
      payload: defaultFederalTables().federalWithholding,
    },
    {
      jurisdiction: "US-FED",
      table_type: "fica",
      version_label: "fallback",
      payload: defaultFederalTables().fica,
    },
    {
      jurisdiction: "US-FED",
      table_type: "futa",
      version_label: "fallback",
      payload: defaultFederalTables().futa,
    },
  ]);
}
