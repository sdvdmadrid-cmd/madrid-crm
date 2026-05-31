import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

function allowAuditSeed() {
  return (
    process.env.E2E_BYPASS_RATE_LIMIT === "1" ||
    process.env.NODE_ENV !== "production"
  );
}

/**
 * Authenticated lead seed for local/E2E audits only.
 * Production returns 404.
 */
export async function POST(request) {
  if (!allowAuditSeed()) {
    return Response.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const stamp = Date.now();
    const name = String(body.name || `Audit Lead ${stamp}`).trim().slice(0, 200);
    const email = String(body.email || `lead.audit+${stamp}@example.com`)
      .trim()
      .slice(0, 200);
    const phone = String(body.phone || "+15550008888").trim().slice(0, 20);
    const description = String(
      body.description || `E2E lead audit ${stamp}`,
    )
      .trim()
      .slice(0, 2000);
    const serviceNeeded = String(body.serviceNeeded || "Roof repair")
      .trim()
      .slice(0, 160);
    const status = String(body.status || "new").trim().toLowerCase() || "new";
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("contractor_website_leads")
      .insert({
        tenant_id: tenantDbId,
        slug: "e2e-audit",
        name,
        email,
        phone,
        description,
        service_needed: serviceNeeded,
        status,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, name, status, created_at")
      .single();

    if (error) {
      console.error("[api/lead-inbox/leads][POST]", error);
      return Response.json(
        { success: false, error: "Unable to seed lead" },
        { status: 500 },
      );
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error("[api/lead-inbox/leads][POST] error", error);
    return Response.json(
      { success: false, error: "Unable to seed lead" },
      { status: 500 },
    );
  }
}
