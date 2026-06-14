import { listProjectPlSummaries } from "@/lib/project-pl.js";
import { getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse, unauthenticatedResponse } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId  } = context;
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
