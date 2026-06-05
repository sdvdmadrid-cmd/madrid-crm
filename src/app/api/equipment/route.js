import {
  assignEquipmentToJob,
  createEquipment,
  listEquipment,
} from "@/lib/job-expense-service.js";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const equipment = await listEquipment(tenantDbId);
    return Response.json({ success: true, data: equipment });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const action = String(body.action || "create").toLowerCase();

    if (action === "assign") {
      const assignment = await assignEquipmentToJob(tenantDbId, userId, body);
      return Response.json({ success: true, data: assignment });
    }

    const equipment = await createEquipment(tenantDbId, body);
    return Response.json({ success: true, data: equipment });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
