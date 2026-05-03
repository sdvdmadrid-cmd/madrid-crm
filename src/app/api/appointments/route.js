import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPastYmd, isValidYmd } from "@/lib/local-date";
import { assertSafeText } from "@/lib/input-sanitizer";
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
  title: assertSafeText("title", body.title || "", 200),
  client: assertSafeText("client", body.clientName || body.client || "", 200),
  date: body.date || null,
  time: body.time || null,
  location: assertSafeText("location", body.location || "", 300),
  notes: assertSafeText("notes", body.notes || "", 2000),
  status: statusToDb(body.status),
  // Nunca incluir user_id
  ...extra,
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
      throw new Error("Unable to load appointments");
    }

    return new Response(JSON.stringify((data || []).map(serialize)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/appointments][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: "Unable to load appointments" }),
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
      throw new Error("Unable to save appointment");
    }

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const isUserFacing = error.message && (
      error.message === "Unable to save appointment" ||
      error.message.startsWith("Unsafe") ||
      error.message.startsWith("Payload")
    );
    console.error("[api/appointments][POST] error", isUserFacing ? "" : error);
    return new Response(
      JSON.stringify({ success: false, error: isUserFacing ? error.message : "Unable to save appointment" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
