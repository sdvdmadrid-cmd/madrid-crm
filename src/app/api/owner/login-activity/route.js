import { loadOwnerLoginActivity } from "@/lib/owner-command-center";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { authenticated, role } = await getAuthenticatedTenantContext(request);
  if (!authenticated || role !== "super_admin") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await loadOwnerLoginActivity();
    return Response.json({ success: true, data });
  } catch (error) {
    console.error("[api/owner/login-activity] error", error);
    return Response.json(
      { success: false, error: error?.message || "Unable to load login activity" },
      { status: 500 },
    );
  }
}
