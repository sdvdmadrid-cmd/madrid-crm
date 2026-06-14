import { createInvoiceFromJob } from "@/lib/job-invoice-service.js";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role, userId  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canManageSensitive(role)) return forbiddenResponse();

    const { id: jobId } = await params;
    const body = await request.json();

    const result = await createInvoiceFromJob({
      tenantDbId,
      userId,
      jobId,
      billingType: body.billingType || "full",
      percent: body.percent,
      changeOrderAmount: body.changeOrderAmount,
      notes: body.notes || "",
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    console.error("[api/jobs/:id/invoice][POST]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
