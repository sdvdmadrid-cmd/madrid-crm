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

export async function PATCH(request, { params }) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid service id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
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
      .from("services_catalog")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      query = supabaseAdmin
        .from("services_catalog")
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
      throw new Error(error.message);
    }
    if (!data) {
      return new Response(
        JSON.stringify({ success: false, error: "Service not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/services-catalog/:id][PATCH] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
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
      return new Response(
        JSON.stringify({ success: false, error: "Invalid service id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let query = supabaseAdmin.from("services_catalog").delete().eq("id", id);

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
      throw new Error(error.message);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/services-catalog/:id][DELETE] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
