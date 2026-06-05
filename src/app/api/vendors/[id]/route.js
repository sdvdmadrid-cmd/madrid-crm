import {
  deleteVendor,
  getVendorById,
  updateVendor,
} from "@/lib/vendor-service";
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

export async function GET(request, { params }) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    const vendor = await getVendorById({ tenantDbId, role, vendorId: id });
    if (!vendor) return json({ success: false, error: "Vendor not found" }, 404);
    return json({ success: true, data: vendor });
  } catch (error) {
    console.error("[api/vendors/:id][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
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
    const vendor = await updateVendor({ tenantDbId, role, vendorId: id, body });
    return json({ success: true, data: vendor });
  } catch (error) {
    console.error("[api/vendors/:id][PATCH]", error);
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
    await deleteVendor({ tenantDbId, role, vendorId: id });
    return json({ success: true });
  } catch (error) {
    console.error("[api/vendors/:id][DELETE]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
