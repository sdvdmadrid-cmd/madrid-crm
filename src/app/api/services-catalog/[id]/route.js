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

export async function PATCH(request, { params }) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) {
      return jsonResponse({ success: false, error: "Invalid service id" }, 400);
    }

    const body = sanitizePayloadDeep(await request.json());

    const updateRow = { updated_at: new Date().toISOString() };
    if ("name" in body) updateRow.name = String(body.name || "").trim();
    if ("description" in body)
      updateRow.description = String(body.description || "").trim();
    if ("category" in body)
      updateRow.category = String(body.category || "").trim();
    if ("unit" in body) updateRow.unit = String(body.unit || "").trim();
    if ("priceMin" in body)
      updateRow.price_min = Number(body.priceMin || 0) || 0;
    if ("priceMax" in body)
      updateRow.price_max = Number(body.priceMax || 0) || 0;
    if ("materials" in body)
      updateRow.materials = String(body.materials || "").trim();
    if ("laborNotes" in body)
      updateRow.labor_notes = String(body.laborNotes || "").trim();
    if ("state" in body)
      updateRow.state = String(body.state || "ALL").trim() || "ALL";
    if ("pricingType" in body) {
      updateRow.pricing_type =
        String(body.pricingType || "per_unit").trim() || "per_unit";
    }
    if ("materialCost" in body)
      updateRow.material_cost = Number(body.materialCost || 0) || 0;
    if ("laborCost" in body)
      updateRow.labor_cost = Number(body.laborCost || 0) || 0;
    if ("overheadPercentage" in body) {
      updateRow.overhead_percentage =
        Number(body.overheadPercentage || 10) || 10;
    }
    if ("profitPercentage" in body) {
      updateRow.profit_percentage = Number(body.profitPercentage || 20) || 20;
    }

    let query = supabaseAdmin
      .from(TABLE)
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      query = supabaseAdmin
        .from(TABLE)
        .update(updateRow)
        .eq("id", id)
        .eq("tenant_id", tenantDbId)
        .select("*")
        .maybeSingle();

      if (userId && userId !== "system") {
        query = query.eq("user_id", userId);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error(
        "[api/services-catalog/:id][PATCH] Supabase update error",
        error,
      );
      throw error;
    }
    if (!data) {
      return jsonResponse({ success: false, error: "Service not found" }, 404);
    }

    return jsonResponse({ success: true, data: serialize(data) }, 200);
  } catch (error) {
    console.error("[api/services-catalog/:id][PATCH] error", error);
    return handleServicesCatalogError(
      error,
      "Unable to update service right now.",
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) {
      return jsonResponse({ success: false, error: "Invalid service id" }, 400);
    }

    let query = supabaseAdmin.from(TABLE).delete().eq("id", id);

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
      if (userId && userId !== "system") {
        query = query.eq("user_id", userId);
      }
    }

    const { error } = await query;
    if (error) {
      console.error(
        "[api/services-catalog/:id][DELETE] Supabase delete error",
        error,
      );
      throw error;
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("[api/services-catalog/:id][DELETE] error", error);
    return handleServicesCatalogError(
      error,
      "Unable to delete service right now.",
    );
  }
}
