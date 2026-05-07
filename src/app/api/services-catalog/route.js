import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const TABLE = "services_catalog";
const SELECT_COLUMNS =
  "id, tenant_id, user_id, created_by, name, description, category, unit, price_min, price_max, created_at, updated_at";

function hasAuthCredentials(request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) return true;
  const cookieHeader = String(request.headers.get("cookie") || "");
  return (
    cookieHeader.includes("__Host-madrid_session=") ||
    cookieHeader.includes("madrid_session=")
  );
}

function toServiceDoc(row) {
  return {
    _id: row.id,
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    createdBy: row.created_by,
    name: row.name || "",
    description: row.description || "",
    category: row.category || "",
    unit: row.unit || "service",
    priceMin: Number(row.price_min || 0),
    priceMax: Number(row.price_max || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function GET(request) {
  try {
    if (!hasAuthCredentials(request)) return unauthenticatedResponse();

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    let query = supabaseAdmin
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false });

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return Response.json({
      success: true,
      data: (data || []).map(toServiceDoc),
    });
  } catch (error) {
    console.error("[api/services-catalog][GET]", error);
    return Response.json(
      { success: false, error: error.message || "Unable to load services" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    if (!hasAuthCredentials(request)) return unauthenticatedResponse();

    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = sanitizePayloadDeep(await request.json());
    const name = String(body?.name || "").trim();
    const category = String(body?.category || "General").trim();

    if (!name) {
      return Response.json(
        { success: false, error: "Service name is required" },
        { status: 400 },
      );
    }

    const insertRow = {
      tenant_id: tenantDbId,
      user_id: userId,
      created_by: userId,
      name,
      description: String(body?.description || "").trim(),
      category: category || "General",
      unit: String(body?.unit || "service").trim() || "service",
      price_min: Number(body?.priceMin || 0),
      price_max: Number(body?.priceMax || 0),
    };

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert(insertRow)
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw new Error(error.message);

    return Response.json({ success: true, data: toServiceDoc(data) });
  } catch (error) {
    console.error("[api/services-catalog][POST]", error);
    return Response.json(
      { success: false, error: error.message || "Unable to save service" },
      { status: 500 },
    );
  }
}
