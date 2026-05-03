import { getCurrentLegalVersionForTenant } from "@/lib/legal-versions";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated || !userId) {
      return Response.json(
        { success: false, error: "Unauthenticated" },
        { status: 401 },
      );
    }

    const current = await getCurrentLegalVersionForTenant({
      tenantId: tenantDbId,
      userId,
    });

    return Response.json(
      {
        success: true,
        data: {
          version: current.version_name,
          contentSnapshot: current.content_snapshot || "",
          updatedAt: current.created_at,
          effectiveDate: current.created_at,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/legal/version] error", error);
    return Response.json(
      { success: false, error: "Failed to resolve tenant legal version." },
      { status: 500 },
    );
  }
}
