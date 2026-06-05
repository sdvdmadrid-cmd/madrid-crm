import "server-only";

import { PAYROLL_TABLES } from "./payroll-constants.js";
import { serializePayrollSettings } from "./payroll-serializer.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { scopeByTenant } from "./tenant-scope.js";

export {
  applyEmployeeSettingsDefaults,
  mergeTaxTablesWithSettings,
  overtimeHoursThresholdForPeriod,
  resolveRunItemHours,
  suggestedPayRunFromSettings,
  taxTablesForEmployee,
} from "./payroll-settings-utils.js";

export async function getPayrollSettingsForTenant({ tenantDbId, role }) {
  if (!tenantDbId) {
    return serializePayrollSettings({});
  }

  const { data, error } = await scopeByTenant(
    supabaseAdmin
      .from(PAYROLL_TABLES.SETTINGS)
      .select("*")
      .eq("tenant_id", tenantDbId)
      .maybeSingle(),
    { tenantDbId, role },
  );

  if (error) throw new Error(error.message);

  return serializePayrollSettings(
    data ? { ...data, tenant_id: tenantDbId } : { tenant_id: tenantDbId },
  );
}
