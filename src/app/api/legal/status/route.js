import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentLegalVersionForTenant } from "@/lib/legal-versions";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

export async function GET(request) {
  try {
    const { userId, tenantDbId, authenticated } =
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
    const scopedTenantId = String(tenantDbId || userId || "").trim();

    const { data: acceptance, error } = await supabaseAdmin
      .from("legal_acceptance")
      .select("id, version, accepted_at")
      .eq("user_id", userId)
      .eq("tenant_id", scopedTenantId)
      .eq("version", current.version_name)
      .eq("accepted", true)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[api/legal/status] Query error", error);
      return Response.json(
        { success: false, error: "Failed to check acceptance." },
        { status: 500 },
      );
    }

    return Response.json(
      {
        success: true,
        data: {
          accepted: !!acceptance,
          version: current.version_name,
          acceptedAt: acceptance?.accepted_at || null,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/legal/status] error", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
