import { getOwnerCapacitySnapshot } from "@/lib/owner-command-center";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

export async function GET(request) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated || role !== "super_admin") {
      return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const data = await getOwnerCapacitySnapshot();
    return Response.json({ success: true, data });
  } catch (error) {
    console.error("[api/admin/capacity]", error);
    return Response.json(
      { success: false, error: error.message || "Unable to load capacity snapshot" },
      { status: 500 },
    );
  }
}
