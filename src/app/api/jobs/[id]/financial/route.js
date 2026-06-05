import { getJobProjectPl } from "@/lib/project-pl.js";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    const pl = await getJobProjectPl(tenantDbId, id);
    return Response.json({ success: true, data: pl });
  } catch (error) {
    console.error("[api/jobs/:id/financial][GET]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
