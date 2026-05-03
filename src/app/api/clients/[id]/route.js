import {
  buildClientUpdateRow,
  CLIENT_SELECT_COLUMNS,
  createClientErrorResponse,
  serializeClient,
} from "@/lib/client-records";
import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import {
  canDelete,
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const TABLE = "clients";

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
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function notFound() {
  return new Response(
    JSON.stringify({ success: false, error: "Client not found" }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    },
  );
}

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

    let query = supabaseAdmin
      .from(TABLE)
      .select(CLIENT_SELECT_COLUMNS)
      .eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      logSupabaseError("[api/clients/:id][GET] Supabase query error", error, {
        id,
        tenantDbId,
        role,
      });
      throw new Error(error.message);
    }
    if (!data) return notFound();

    return new Response(JSON.stringify(serializeClient(data)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/clients/:id][GET] Supabase error", error);
    return createClientErrorResponse(error, "Unable to load client");
  }
}

export async function PATCH(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

    if (!hasAuthCredentials(request)) {
      return unauthenticatedResponse();
    }

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) return badId();

    const body = sanitizePayloadDeep(await request.json());
    const updateRow = buildClientUpdateRow(body);

    let query = supabaseAdmin
      .from(TABLE)
      .update(updateRow)
      .eq("id", id)
      .select(CLIENT_SELECT_COLUMNS)
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      query = supabaseAdmin
        .from(TABLE)
        .update(updateRow)
        .eq("id", id)
        .eq("tenant_id", tenantDbId)
        .select(CLIENT_SELECT_COLUMNS)
        .maybeSingle();
    }

    const { data, error } = await query;
    if (error) {
      logSupabaseError(
        "[api/clients/:id][PATCH] Supabase update error",
        error,
        {
          id,
          tenantDbId,
          role,
          updateKeys: Object.keys(updateRow),
        },
      );
      throw new Error(error.message);
    }
    if (!data) return notFound();

    return new Response(
      JSON.stringify({ success: true, data: serializeClient(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/clients/:id][PATCH] Supabase error", error);
    return createClientErrorResponse(error, "Unable to update client");
  }
}

export async function DELETE(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

    if (!hasAuthCredentials(request)) {
      return unauthenticatedResponse();
    }

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canDelete(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) return badId();

    let query = supabaseAdmin.from(TABLE).delete().eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query.select("id");
    if (error) {
      logSupabaseError(
        "[api/clients/:id][DELETE] Supabase delete error",
        error,
        { id, tenantDbId, role },
      );
      throw new Error(error.message);
    }
    if (!data || data.length === 0) return notFound();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/clients/:id][DELETE] Supabase error", error);
    return createClientErrorResponse(error, "Unable to delete client");
  }
}
