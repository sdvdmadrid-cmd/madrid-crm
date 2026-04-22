import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

// Tabla relacional: services_catalog

const serialize = (doc) => ({
  ...doc,
  _id: doc.id,
  tenantId: doc.tenant_id || "",
  userId: doc.user_id || null,
  createdAt: doc.created_at || null,
  updatedAt: doc.updated_at || null,
});

function toRow(item, tenantId, userId) {
  const nowIso = new Date().toISOString();
  return {
    tenant_id: tenantId,
    user_id: userId || null,
    name: String(item.name || "").trim(),
    description: String(item.description || "").trim(),
    category: String(item.category || "").trim(),
    unit: String(item.unit || "").trim(),
    price_min: Number(item.priceMin || 0) || 0,
    price_max: Number(item.priceMax || 0) || 0,
    materials: String(item.materials || "").trim(),
    labor_notes: String(item.laborNotes || "").trim(),
    state: String(item.state || "ALL").trim() || "ALL",
    pricing_type: String(item.pricingType || "per_unit").trim() || "per_unit",
    material_cost: Number(item.materialCost || 0) || 0,
    labor_cost: Number(item.laborCost || 0) || 0,
    overhead_percentage: Number(item.overheadPercentage || 10) || 10,
    profit_percentage: Number(item.profitPercentage || 20) || 20,
    created_by: userId || null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export async function GET(request) {
  try {
    const { tenantDbId, userId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { searchParams } = new URL(request.url);
    const category = String(searchParams.get("category") || "").trim();
    const state = String(searchParams.get("state") || "").trim();

    let query = supabaseAdmin
      .from("services_catalog")
      .select("*")
      .order("name", { ascending: true });

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }
    if (category) query = query.eq("category", category);
    if (state && state !== "ALL") {
      query = query.in("state", [state, "ALL"]);
    }
    if (userId && userId !== "system") {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[api/services-catalog][GET] Supabase query error", error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify((data || []).map(serialize)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/services-catalog][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function POST(request) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = sanitizePayloadDeep(await request.json());

    if (Array.isArray(body)) {
      const rows = body.map((item) => toRow(item, tenantDbId, userId));
      const { data, error } = await supabaseAdmin
        .from("services_catalog")
        .insert(rows)
        .select("*");
      if (error) {
        console.error(
          "[api/services-catalog][POST] Supabase bulk insert error",
          error,
        );
        throw new Error(error.message);
      }

      return new Response(
        JSON.stringify({ success: true, data: (data || []).map(serialize) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("services_catalog")
      .insert(toRow(body, tenantDbId, userId))
      .select("*")
      .single();

    if (error) {
      console.error(
        "[api/services-catalog][POST] Supabase insert error",
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
    console.error("[api/services-catalog][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
