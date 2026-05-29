import { loadClientDetailsBundle } from "@/lib/client-details-data";
import { createClientErrorResponse } from "@/lib/client-records";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

function hasAuthCredentials(request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return true;
  }

  const cookieHeader = String(request.headers.get("cookie") || "");
  return (
    cookieHeader.includes("__Host-madrid_session=") ||
    cookieHeader.includes("madrid_session=")
  );
}

function badId() {
  return new Response(
    JSON.stringify({ success: false, error: "Invalid client id" }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

function notFound() {
  return new Response(
    JSON.stringify({ success: false, error: "Client not found" }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * GET /api/clients/:id/details
 */
export async function GET(request, { params }) {
  try {
    if (!hasAuthCredentials(request)) {
      return unauthenticatedResponse();
    }

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) return badId();

    const bundle = await loadClientDetailsBundle({
      clientId: String(id),
      tenantDbId,
      isSuperAdmin: (role || "").toLowerCase() === "super_admin",
    });

    if (!bundle) return notFound();

    return new Response(
      JSON.stringify({
        success: true,
        data: bundle,
        warnings: bundle.warnings || [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return createClientErrorResponse(error, "Unable to load client details");
  }
}
