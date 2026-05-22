import { loadOwnerActivityLog } from "@/lib/owner-command-center";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

export async function GET(request) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated || role !== "super_admin") {
      return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const rows = await loadOwnerActivityLog();
    return Response.json({ success: true, data: rows });
  } catch (error) {
    console.error("[api/admin/activity-log]", error);
    return Response.json(
      { success: false, error: error.message || "Unable to load activity log" },
      { status: 500 },
    );
  }
}
