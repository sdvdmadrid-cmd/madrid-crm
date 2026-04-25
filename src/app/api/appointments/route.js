import { supabaseAdmin } from "@/lib/supabase-admin";
import {
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

const toAppointmentRecord = (body, extra = {}) => ({
  title: body.title || "",
  client: body.clientName || body.client || "",
  date: body.date || null,
  time: body.time || null,
  location: body.location || "",
  notes: body.notes || "",
  status: statusToDb(body.status),
  // Nunca incluir user_id
  ...extra,
});

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    let query = supabaseAdmin
      .from("appointments")
      .select("*")
      .order("date", { ascending: true });
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[api/appointments][GET] Supabase query error", error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify((data || []).map(serialize)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/appointments][GET] Supabase error", error);
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
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const toInsert = toAppointmentRecord(body, {
      tenant_id: tenantDbId,
    });

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .insert([toInsert])
      .select("*")
      .single();

    if (error) {
      console.error("[api/appointments][POST] Supabase insert error", error);
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
    console.error("[api/appointments][POST] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
