import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

// Tabla relacional: estimate_builder

const serialize = (doc) => {
  const createdAt = doc.created_at || doc.createdAt || null;
  const updatedAt = doc.updated_at || doc.updatedAt || null;

  return {
    ...doc,
    _id: doc.id,
    id: doc.id,
    tenantId: doc.tenant_id || doc.tenantId || null,
    userId: doc.user_id || doc.userId || null,
    createdBy: doc.created_by || doc.createdBy || null,
    createdAt,
    updatedAt,
  };
};

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    let query = supabaseAdmin
      .from("estimate_builder")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[api/estimate-builder][GET] Supabase query error", error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify((data || []).map(serialize)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/estimate-builder][GET] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function POST(request) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const nowIso = new Date().toISOString();

    const toInsert = {
      ...body,
      tenant_id: tenantDbId,
      user_id: userId || null,
      created_by: userId || null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data, error } = await supabaseAdmin
      .from("estimate_builder")
      .insert(toInsert)
      .select("*")
      .single();

    if (error) {
      console.error(
        "[api/estimate-builder][POST] Supabase insert error",
        error,
      );
      throw new Error(error.message);
    }

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/estimate-builder][POST] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
