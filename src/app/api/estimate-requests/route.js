import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const TABLE = "estimate_requests";

const serialize = (doc) => ({
  ...doc,
  _id: doc.id,
  tenantId: doc.tenant_id || "",
  userId: doc.user_id || null,
  requestType: doc.request_type || doc.requestType || "change",
  clientName: doc.client_name || doc.clientName || "",
  jobTitle: doc.job_title || doc.jobTitle || "",
  contactName: doc.contact_name || doc.contactName || "",
  contactEmail: doc.contact_email || doc.contactEmail || "",
  contactPhone: doc.contact_phone || doc.contactPhone || "",
  createdAt: doc.created_at || null,
  updatedAt: doc.updated_at || null,
});

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "")
      .trim()
      .toLowerCase();

    let query = supabaseAdmin
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      console.error("[api/estimate-requests][GET] Supabase query error", error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify((data || []).map(serialize)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/estimate-requests][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function PATCH(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const requestId = String(body.requestId || "").trim();
    const status = String(body.status || "")
      .trim()
      .toLowerCase();

    if (!requestId) {
      return new Response(
        JSON.stringify({ success: false, error: "requestId is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!["pending", "reviewed", "resolved", "new"].includes(status)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid status" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let query = supabaseAdmin
      .from(TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      query = supabaseAdmin
        .from(TABLE)
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("tenant_id", tenantDbId)
        .select("*")
        .maybeSingle();
    }

    const { data, error } = await query;
    if (error) {
      console.error(
        "[api/estimate-requests][PATCH] Supabase update error",
        error,
      );
      throw new Error(error.message);
    }
    if (!data) {
      return new Response(
        JSON.stringify({ success: false, error: "Request not found" }),
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
    console.error("[api/estimate-requests][PATCH] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
