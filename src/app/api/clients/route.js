import {
  buildClientInsertRow,
  CLIENT_SELECT_COLUMNS,
  createClientErrorResponse,
  serializeClient,
} from "@/lib/client-records";
import { listClientsForTenant } from "@/lib/clients-list-server";
import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  canRead,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getListPaginationParams, scopeByTenant } from "@/lib/tenant-scope";

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

    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;

    const { tenantDbId, role, authenticated } = context;
    if (!authenticated) return unauthenticatedResponse();
    if (!canRead(role)) return forbiddenResponse();

    const { searchParams } = new URL(request.url);
    const search = String(searchParams.get("search") || searchParams.get("q") || "").trim();
    const { paginate, page, limit, from, to } =
      getListPaginationParams(searchParams);

    if (paginate) {
      const payload = await listClientsForTenant({
        tenantDbId,
        role,
        page,
        limit,
        search,
      });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let query = scopeByTenant(
      supabaseAdmin
        .from(TABLE)
        .select(CLIENT_SELECT_COLUMNS, {
          count: paginate ? "exact" : undefined,
        })
        .order("created_at", { ascending: false }),
      { tenantDbId, role },
    );

    if (paginate) {
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
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    if (!hasAuthCredentials(request)) {
      return unauthenticatedResponse();
    }

    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;

    const { tenantDbId, role, userId, authenticated } = context;
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
