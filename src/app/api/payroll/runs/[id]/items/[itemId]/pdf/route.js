import { pdfResponse } from "@/lib/document-pdf-core";
import { buildPayStubPdfBuffer, pdfFilenameForPayStub } from "@/lib/payroll-stub-pdf";
import { loadPayStubContext } from "@/lib/payroll-stub-service";
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

    const { id: runId, itemId } = await params;
    const ctx = await loadPayStubContext({ tenantDbId, role, runId, itemId });
    const buffer = await buildPayStubPdfBuffer(ctx);
    const filename = pdfFilenameForPayStub(ctx);
    const download = new URL(request.url).searchParams.get("download") === "1";

    return pdfResponse(buffer, filename, { download });
  } catch (error) {
    console.error("[api/payroll/runs/:id/items/:itemId/pdf][GET]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
