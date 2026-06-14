import { pdfResponse } from "@/lib/document-pdf-core.js";
import { getCompanyDocumentBranding } from "@/lib/company-document-branding.js";
import { buildPayrollReport } from "@/lib/payroll-reports.js";
import { buildW2PdfBuffer, build1099PdfBuffer, pdfFilenameForW2 } from "@/lib/payroll-w2-pdf.js";
import { serializePayrollEmployee, serializePayrollSettings } from "@/lib/payroll-serializer.js";
import { PAYROLL_TABLES } from "@/lib/payroll-constants.js";
import { supabaseAdmin } from "@/lib/supabase-admin.js";
import { scopeByTenant } from "@/lib/tenant-scope.js";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const { id, year } = await params;
    const taxYear = Number(year) || new Date.getFullYear();

    const { data: employeeRow, error } = await scopeByTenant(
      supabaseAdmin.from(PAYROLL_TABLES.EMPLOYEES).select("*").eq("id", id).maybeSingle(),
      { tenantDbId, role },
    );
    if (error) throw new Error(error.message);
    if (!employeeRow) {
      return Response.json({ success: false, error: "Employee not found" }, { status: 404 });
    }

    const employee = serializePayrollEmployee(employeeRow);
    const report = await buildPayrollReport({
      tenantDbId,
      reportType: "ytd",
      startDate: `${taxYear}-01-01`,
      endDate: `${taxYear}-12-31`,
      employeeId: id,
    });

    const empTotals =
      report.byEmployee?.find((row) => row.employeeId === id)?.totals || report.totals;

    const branding = await getCompanyDocumentBranding(tenantDbId);
    const { data: settingsRow } = await supabaseAdmin
      .from(PAYROLL_TABLES.SETTINGS)
      .select("*")
      .eq("tenant_id", tenantDbId)
      .maybeSingle();
    const employer = settingsRow ? serializePayrollSettings(settingsRow) : {};

    const is1099 = employee.taxForm === "1099";
    const buffer = is1099
      ? await build1099PdfBuffer({
          branding,
          payer: employer,
          contractor: employee,
          year: taxYear,
          ytd: empTotals,
        })
      : await buildW2PdfBuffer({
          branding,
          employer,
          employee,
          year: taxYear,
          ytd: empTotals,
        });

    const filename = pdfFilenameForW2({ employee, year: taxYear });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return pdfResponse(buffer, filename, { download });
  } catch (error) {
    console.error("[api/payroll/employees/:id/w2/:year][GET]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
