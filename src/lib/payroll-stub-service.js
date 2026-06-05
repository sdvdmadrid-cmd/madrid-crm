import "server-only";

import { getCompanyDocumentBranding } from "./company-document-branding.js";
import { PAYROLL_TABLES } from "./payroll-constants.js";
import {
  serializePayrollEmployee,
  serializePayrollRun,
  serializePayrollRunItem,
  serializePayrollSettings,
} from "./payroll-serializer.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { scopeByTenant } from "./tenant-scope.js";

export async function loadPayStubContext({
  tenantDbId,
  role,
  runId,
  itemId,
}) {
  const { data: itemRow, error: itemError } = await supabaseAdmin
    .from(PAYROLL_TABLES.RUN_ITEMS)
    .select("*, payroll_employees(*), payroll_runs(*)")
    .eq("id", itemId)
    .eq("run_id", runId)
    .eq("tenant_id", tenantDbId)
    .maybeSingle();

  if (itemError) throw new Error(itemError.message);
  if (!itemRow) throw new Error("Pay stub not found");

  const runRow = itemRow.payroll_runs;
  const employeeRow = itemRow.payroll_employees;
  if (!runRow || !employeeRow) throw new Error("Pay stub data incomplete");

  if (!["calculated", "approved", "finalized"].includes(runRow.status)) {
    throw new Error("Calculate the pay run before generating a pay stub.");
  }

  const { data: settingsRow } = await scopeByTenant(
    supabaseAdmin
      .from(PAYROLL_TABLES.SETTINGS)
      .select("*")
      .eq("tenant_id", tenantDbId)
      .maybeSingle(),
    { tenantDbId, role },
  );

  const branding = await getCompanyDocumentBranding(tenantDbId);

  return {
    branding,
    employer: settingsRow ? serializePayrollSettings(settingsRow) : {},
    employee: serializePayrollEmployee(employeeRow),
    run: serializePayrollRun(runRow),
    item: serializePayrollRunItem(itemRow, employeeRow),
  };
}
