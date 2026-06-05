import {
  deleteExpenseBill,
  updateExpenseBill,
} from "@/lib/bills-expenses-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function PATCH(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json();
    const bill = await updateExpenseBill({ tenantDbId, role, billId: id, body });
    return json({ success: true, data: bill });
  } catch (error) {
    console.error("[api/expenses/bills/:id][PATCH]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function DELETE(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    await deleteExpenseBill({ tenantDbId, role, billId: id });
    return json({ success: true });
  } catch (error) {
    console.error("[api/expenses/bills/:id][DELETE]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
