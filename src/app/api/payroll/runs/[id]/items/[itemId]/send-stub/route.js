import { buildPayStubEmailAttachments } from "@/lib/payroll-email-attachments";
import { sendPayStubDeliveryEmail } from "@/lib/payroll-email-notifications.js";
import { loadPayStubContext } from "@/lib/payroll-stub-service";import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: runId, itemId } = await params;
    const body = await request.json().catch(() => ({}));
    const ctx = await loadPayStubContext({ tenantDbId, role, runId, itemId });

    const to = String(body.to || ctx.employee.email || "").trim();
    if (!to) {
      return Response.json(
        { success: false, error: "Employee email is required." },
        { status: 400 },
      );
    }

    const attachments = await buildPayStubEmailAttachments({
      tenantDbId,
      role,
      runId,
      itemId,
    });

    const company = ctx.branding.companyName || "Your employer";
    const payDate = ctx.run.payDate || "";
    const netPay = Number(ctx.item.netPay || 0).toFixed(2);

    await sendPayStubDeliveryEmail({
      tenantId: tenantDbId,
      to,
      employeeName: ctx.employee.firstName || "there",
      companyName: company,
      payDate,
      netPay,
      hasAttachment: attachments.length > 0,
      attachments,
    });
    return Response.json({ success: true, data: { sentTo: to } });
  } catch (error) {
    console.error("[api/payroll/runs/:id/items/:itemId/send-stub][POST]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
