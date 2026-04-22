import {
  buildClientInsertRow,
  CLIENT_SELECT_COLUMNS,
  createClientErrorResponse,
  serializeClient,
} from "@/lib/client-records";
import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import {
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

export async function GET(request) {
  try {
    if (!hasAuthCredentials(request)) {
      return unauthenticatedResponse();
    }

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") || 0));
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get("limit") || 0)),
    );
    const paginate = searchParams.has("page") || searchParams.has("limit");

    let query = supabaseAdmin
      .from(TABLE)
      .select(CLIENT_SELECT_COLUMNS, { count: paginate ? "exact" : undefined })
      .order("created_at", { ascending: false });

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    if (paginate) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data, count, error } = await query;
    if (error) {
      logSupabaseError("[api/clients][GET] Supabase query error", error, {
        tenantDbId,
        role,
      });
      throw new Error(error.message);
    }

    const docs = (data || []).map(serializeClient);

    if (paginate) {
      const total = Number(count || 0);
      return new Response(
        JSON.stringify({
          data: docs,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(docs), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/clients][GET] Supabase error", error);
    return createClientErrorResponse(error, "Unable to load clients");
  }
}

export async function POST(request) {
  try {
    if (!hasAuthCredentials(request)) {
      return unauthenticatedResponse();
    }

    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = sanitizePayloadDeep(await request.json());
    const insertRow = buildClientInsertRow(body, {
      tenantId: tenantDbId,
      userId,
    });

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert(insertRow)
      .select(CLIENT_SELECT_COLUMNS)
      .single();

    if (error) {
      logSupabaseError("[api/clients][POST] Supabase insert error", error, {
        tenantDbId,
        userId,
      });
      throw new Error(error.message);
    }

    return new Response(
      JSON.stringify({ success: true, data: serializeClient(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/clients][POST] Supabase error", error);
    return createClientErrorResponse(error, "Unable to save client");
  }
}
