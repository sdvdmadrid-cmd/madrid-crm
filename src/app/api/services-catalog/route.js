import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

// Tabla relacional: services_catalog
const TABLE = "services_catalog";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getServicesCatalogSchemaError(error) {
  const message = String(error?.message || "");

  if (
    /Could not find the table 'public\.services_catalog' in the schema cache/i.test(
      message,
    )
  ) {
    return "Services catalog is unavailable because the Supabase table is missing or the schema cache has not reloaded yet. Run the services catalog migration and reload the PostgREST schema cache.";
  }

  if (/relation\s+"?public\.services_catalog"?\s+does not exist/i.test(message)) {
    return "Services catalog is unavailable because the Supabase table does not exist yet. Run the services catalog migration first.";
  }

  return "";
}

function handleServicesCatalogError(error, fallbackMessage) {
  const schemaError = getServicesCatalogSchemaError(error);
  if (schemaError) {
    return jsonResponse({ success: false, error: schemaError }, 503);
  }

  return jsonResponse({ success: false, error: fallbackMessage }, 500);
}

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
      .from(TABLE)
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
      throw error;
    }

    return jsonResponse((data || []).map(serialize), 200);
  } catch (error) {
    console.error("[api/services-catalog][GET] error", error);
    return handleServicesCatalogError(
      error,
      "Unable to load services catalog right now.",
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
        .from(TABLE)
        .insert(rows)
        .select("*");
      if (error) {
        console.error(
          "[api/services-catalog][POST] Supabase bulk insert error",
          error,
        );
        throw error;
      }

      return jsonResponse(
        { success: true, data: (data || []).map(serialize) },
        200,
      );
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert(toRow(body, tenantDbId, userId))
      .select("*")
      .single();

    if (error) {
      console.error(
        "[api/services-catalog][POST] Supabase insert error",
        error,
      );
      throw error;
    }

    return jsonResponse({ success: true, data: serialize(data) }, 200);
  } catch (error) {
    console.error("[api/services-catalog][POST] error", error);
    return handleServicesCatalogError(
      error,
      "Unable to save services catalog right now.",
    );
  }
}
