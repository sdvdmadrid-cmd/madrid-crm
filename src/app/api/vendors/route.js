import {
  createVendor,
  listVendorsForTenant,
} from "@/lib/vendor-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "";
    const search = searchParams.get("search") || "";

    const vendors = await listVendorsForTenant({
      tenantDbId,
      role,
      category: category || undefined,
      search,
    });

    return json({ success: true, data: vendors });
  } catch (error) {
    console.error("[api/vendors][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function POST(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role, userId  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const vendor = await createVendor({ tenantDbId, role, userId, body });
    return json({ success: true, data: vendor }, 201);
  } catch (error) {
    console.error("[api/vendors][POST]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
