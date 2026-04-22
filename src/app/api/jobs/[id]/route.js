import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { logSupabaseError, normalizeUuid } from "@/lib/supabase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canDelete,
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const JOBS = "jobs";

const serialize = (doc) => ({
  _id: doc.id,
  id: doc.id,
  tenantId: doc.tenant_id || "",
  userId: doc.user_id || null,
  title: doc.title || "",
  description: doc.description || "",
  clientId: doc.client_id || "",
  clientName: doc.client_name || "",
  service: doc.service || "",
  status: doc.status || "Pending",
  price: doc.price || "",
  dueDate: doc.due_date || "",
  taxState: doc.tax_state || "",
  downPaymentPercent: doc.down_payment_percent || "0",
  scopeDetails: doc.scope_details || "",
  squareMeters: doc.square_meters || "",
  complexity: doc.complexity || "standard",
  materialsIncluded:
    typeof doc.materials_included === "boolean" ? doc.materials_included : true,
  travelMinutes: doc.travel_minutes || "",
  urgency: doc.urgency || "flexible",
  estimateSnapshot: doc.estimate_snapshot || null,
  quoteToken: doc.quote_token || null,
  quoteSharedAt: doc.quote_shared_at || null,
  quoteSentAt: doc.quote_sent_at || null,
  quoteSentTo: doc.quote_sent_to || "",
  createdAt: doc.created_at || null,
  updatedAt: doc.updated_at || null,
});

function badId() {
  return new Response(
    JSON.stringify({ success: false, error: "Invalid job id" }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function notFound() {
  return new Response(
    JSON.stringify({ success: false, error: "Job not found" }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function buildUpdateRow(body) {
  const row = { updated_at: new Date().toISOString() };

  if ("title" in body) row.title = String(body.title || "");
  if ("description" in body) row.description = String(body.description || "");
  if ("clientId" in body) row.client_id = normalizeUuid(body.clientId);
  if ("clientName" in body) row.client_name = String(body.clientName || "");
  if ("service" in body) row.service = String(body.service || "");
  if ("status" in body) row.status = String(body.status || "Pending");
  if ("price" in body) row.price = String(body.price || "");
  if ("dueDate" in body) row.due_date = String(body.dueDate || "");
  if ("taxState" in body) row.tax_state = String(body.taxState || "");
  if ("downPaymentPercent" in body) {
    row.down_payment_percent = String(body.downPaymentPercent || "0");
  }
  if ("scopeDetails" in body)
    row.scope_details = String(body.scopeDetails || "");
  if ("squareMeters" in body)
    row.square_meters = String(body.squareMeters || "");
  if ("complexity" in body)
    row.complexity = String(body.complexity || "standard");
  if ("materialsIncluded" in body) {
    row.materials_included = Boolean(body.materialsIncluded);
  }
  if ("travelMinutes" in body)
    row.travel_minutes = String(body.travelMinutes || "");
  if ("urgency" in body) row.urgency = String(body.urgency || "flexible");
  if ("estimateSnapshot" in body)
    row.estimate_snapshot = body.estimateSnapshot || null;

  return row;
}

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const { id } = await params;
    if (!id) {
      return badId();
    }

    let query = supabaseAdmin.from(JOBS).select("*").eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data: doc, error } = await query.maybeSingle();
    if (error) {
      logSupabaseError("[api/jobs/:id][GET] Supabase query error", error, {
        id,
        tenantDbId,
        role,
      });
      throw new Error(error.message);
    }

    if (!doc) {
      return notFound();
    }

    return new Response(JSON.stringify(serialize(doc)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/jobs/:id][GET] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canDelete(role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    if (!id) {
      return badId();
    }

    const body = sanitizePayloadDeep(await request.json());
    const updateRow = buildUpdateRow(body);

    let query = supabaseAdmin
      .from(JOBS)
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      query = supabaseAdmin
        .from(JOBS)
        .update(updateRow)
        .eq("id", id)
        .eq("tenant_id", tenantDbId)
        .select("*")
        .maybeSingle();
    }

    const { data: updated, error } = await query;
    if (error) {
      logSupabaseError("[api/jobs/:id][PATCH] Supabase update error", error, {
        id,
        tenantDbId,
        role,
        updateRow,
      });
      throw new Error(error.message);
    }

    if (!updated) {
      return notFound();
    }

    return new Response(
      JSON.stringify({ success: true, data: serialize(updated) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/jobs/:id][PATCH] Supabase error", error);
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
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    if (!id) {
      return badId();
    }

    let query = supabaseAdmin.from(JOBS).delete().eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query.select("id");
    if (error) {
      logSupabaseError("[api/jobs/:id][DELETE] Supabase delete error", error, {
        id,
        tenantDbId,
        role,
      });
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return notFound();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/jobs/:id][DELETE] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
