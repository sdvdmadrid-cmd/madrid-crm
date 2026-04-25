import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canDelete,
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

// Tabla relacional: appointments

const statusFromDb = (value) => {
  switch ((value || "").toLowerCase()) {
    case "confirmed":
      return "Confirmed";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Scheduled";
  }
};

const statusToDb = (value) => {
  switch ((value || "").toLowerCase()) {
    case "confirmed":
      return "confirmed";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "scheduled";
  }
};

const serialize = (doc) => ({
  ...doc,
  _id: doc.id,
  clientName: doc.client || doc.client_name || "",
  client: doc.client || doc.client_name || "",
  status: statusFromDb(doc.status),
  tenantId: doc.tenant_id || "",
  createdAt: doc.created_at || null,
});

const toAppointmentPatch = (body) => ({
  title: body.title || "",
  client: body.clientName || body.client || "",
  date: body.date || null,
  time: body.time || null,
  location: body.location || "",
  notes: body.notes || "",
  status: statusToDb(body.status),
});

function badId() {
  return new Response(
    JSON.stringify({ success: false, error: "Invalid appointment id" }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function notFound() {
  return new Response(
    JSON.stringify({ success: false, error: "Appointment not found" }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) return badId();

    let query = supabaseAdmin.from("appointments").select("*").eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error("[api/appointments/:id][GET] Supabase query error", error);
      throw new Error(error.message);
    }
    if (!data) return notFound();

    return new Response(JSON.stringify(serialize(data)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/appointments/:id][GET] Supabase error", error);
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
    if (!authenticated) return unauthenticatedResponse();
    if (!canDelete(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) return badId();

    const body = await request.json();

    let query = supabaseAdmin
      .from("appointments")
      .update(toAppointmentPatch(body))
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      query = supabaseAdmin
        .from("appointments")
        .update(toAppointmentPatch(body))
        .eq("id", id)
        .eq("tenant_id", tenantDbId)
        .select("*")
        .maybeSingle();
    }

    const { data, error } = await query;
    if (error) {
      console.error(
        "[api/appointments/:id][PATCH] Supabase update error",
        error,
      );
      throw new Error(error.message);
    }
    if (!data) return notFound();

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/appointments/:id][PATCH] Supabase error", error);
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
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) return badId();

    let query = supabaseAdmin.from("appointments").delete().eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query.select("id");
    if (error) {
      console.error(
        "[api/appointments/:id][DELETE] Supabase delete error",
        error,
      );
      throw new Error(error.message);
    }
    if (!data || data.length === 0) return notFound();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/appointments/:id][DELETE] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
