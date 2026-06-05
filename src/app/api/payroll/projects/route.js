import { listProjectPlSummaries } from "@/lib/project-pl.js";
import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const limit = Number(url.searchParams.get("limit") || 50);

    const summaries = await listProjectPlSummaries(tenantDbId, { search, limit });
    return Response.json({ success: true, data: summaries });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
