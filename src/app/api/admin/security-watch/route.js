import { loadOwnerSecurityWatch } from "@/lib/owner-command-center";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

export async function GET(request) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated || role !== "super_admin") {
      return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const data = await loadOwnerSecurityWatch();
    return Response.json({ success: true, data });
  } catch (error) {
    console.error("[api/admin/security-watch]", error);
    return Response.json(
      { success: false, error: error.message || "Unable to load security watch" },
      { status: 500 },
    );
  }
}
