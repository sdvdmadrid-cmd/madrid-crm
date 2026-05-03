import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPastYmd, isValidYmd } from "@/lib/local-date";
import { assertSafeText } from "@/lib/input-sanitizer";
import { enforceSameOriginForMutation } from "@/lib/request-security";
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
  title: assertSafeText("title", body.title || "", 200),
  client: assertSafeText("client", body.clientName || body.client || "", 200),
  date: body.date || null,
  time: body.time || null,
  location: assertSafeText("location", body.location || "", 300),
  notes: assertSafeText("notes", body.notes || "", 2000),
  status: statusToDb(body.status),
});

function validateAppointmentBody(body) {
  if (!String(body?.title || "").trim()) return "Title is required";
  if (!String(body?.clientName || body?.client || "").trim()) return "Client name is required";
  if (!String(body?.date || "").trim()) return "Date is required";
  if (!isValidYmd(body.date)) return "Date must be in YYYY-MM-DD format";
  if (isPastYmd(body.date)) return "Cannot schedule in the past";
  if (!String(body?.time || "").trim()) return "Time is required";
  return "";
}

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
      throw new Error("Unable to load appointment");
    }
    if (!data) return notFound();

    return new Response(JSON.stringify(serialize(data)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/appointments/:id][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: "Unable to load appointment" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canDelete(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) return badId();

    const body = await request.json();
    const validationError = validateAppointmentBody(body);
    if (validationError) {
      return new Response(
        JSON.stringify({ success: false, error: validationError }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

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
      throw new Error("Unable to update appointment");
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
    const isUserFacing = error.message && (
      error.message === "Unable to update appointment" ||
      error.message.startsWith("Unsafe") ||
      error.message.startsWith("Payload")
    );
    console.error("[api/appointments/:id][PATCH] error", isUserFacing ? "" : error);
    return new Response(
      JSON.stringify({ success: false, error: isUserFacing ? error.message : "Unable to update appointment" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

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
      throw new Error("Unable to delete appointment");
    }
    if (!data || data.length === 0) return notFound();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/appointments/:id][DELETE] error", error);
    return new Response(
      JSON.stringify({ success: false, error: "Unable to delete appointment" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
