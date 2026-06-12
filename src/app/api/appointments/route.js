import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPastYmd, isValidYmd } from "@/lib/local-date";
import { assertSafeText } from "@/lib/input-sanitizer";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  canRead,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getListPaginationParams, scopeByTenant, applyUnpaginatedSafetyLimit } from "@/lib/tenant-scope";
import {
  appointmentGeoFieldsFromBody,
  validateAppointmentLocationPayload,
} from "@/lib/appointment-address";

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
  googleEventId: doc.google_event_id || null,
  endTime: doc.end_time || "",
  latitude:
    doc.latitude == null || doc.latitude === ""
      ? null
      : Number(doc.latitude),
  longitude:
    doc.longitude == null || doc.longitude === ""
      ? null
      : Number(doc.longitude),
  addressPlaceId: doc.address_place_id || "",
});

const toAppointmentRecord = (body, extra = {}) => ({
  title: assertSafeText("title", body.title || "", 200),
  client: assertSafeText("client", body.clientName || body.client || "", 200),
  date: body.date || null,
  time: body.time || null,
  end_time: body.endTime ? assertSafeText("endTime", body.endTime, 16) : null,
  location: assertSafeText("location", body.location || "", 300),
  notes: assertSafeText("notes", body.notes || "", 2000),
  status: statusToDb(body.status),
  ...appointmentGeoFieldsFromBody(body),
  // Nunca incluir user_id desde el body — la asignamos desde el contexto auth.
  ...extra,
});

// Build a Date object from a YYYY-MM-DD + HH:MM string pair. Returns null
// if either value is missing or invalid.
function buildAppointmentStartDate(date, time) {
  if (!date || !time) return null;
  const iso = `${date}T${time}:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function validateAppointmentBody(body) {
  if (!String(body?.title || "").trim()) return "Title is required";
  if (!String(body?.clientName || body?.client || "").trim()) return "Client name is required";
  if (!String(body?.date || "").trim()) return "Date is required";
  if (!isValidYmd(body.date)) return "Date must be in YYYY-MM-DD format";
  if (isPastYmd(body.date)) return "Cannot schedule in the past";
  if (!String(body?.time || "").trim()) return "Time is required";
  return validateAppointmentLocationPayload(body);
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canRead(role)) return forbiddenResponse();

    const { searchParams } = new URL(request.url);
    const { paginate, page, limit, from, to } =
      getListPaginationParams(searchParams);
    const rangeFrom = String(searchParams.get("from") || "").trim();
    const rangeTo = String(searchParams.get("to") || "").trim();

    let query = scopeByTenant(
      supabaseAdmin
        .from("appointments")
        .select("*", { count: paginate ? "exact" : undefined })
        .order("date", { ascending: true }),
      { tenantDbId, role },
    );

    if (rangeFrom && rangeTo) {
      query = query.gte("date", rangeFrom).lte("date", rangeTo);
    }

    if (paginate) {
      query = query.range(from, to);
    } else {
      query = applyUnpaginatedSafetyLimit(query, paginate, 400);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error("[api/appointments][GET] Supabase query error", error);
      throw new Error("Unable to load appointments");
    }

    const docs = (data || []).map(serialize);

    if (paginate) {
      const total = Number(count || 0);
      return new Response(
        JSON.stringify({
          data: docs,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(docs), {
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
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const { tenantDbId, role, userId, authenticated } =
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
      user_id: userId || null,
    });

    let data;
    let error;
    {
      // First try with the new google_event_id / user_id columns. If the
      // schema isn't migrated yet, fall back to inserting the base fields
      // only so we never block appointment creation on a deploy ordering
      // race between code and migrations.
      const initial = await supabaseAdmin
        .from("appointments")
        .insert([toInsert])
        .select("*")
        .single();
      if (initial.error && /column.*does not exist/i.test(initial.error.message || "")) {
        const stripped = { ...toInsert };
        delete stripped.user_id;
        delete stripped.end_time;
        delete stripped.latitude;
        delete stripped.longitude;
        delete stripped.address_place_id;
        const retry = await supabaseAdmin
          .from("appointments")
          .insert([stripped])
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
      } else {
        data = initial.data;
        error = initial.error;
      }
    }

    if (error) {
      console.error("[api/appointments][POST] Supabase insert error", error);
      throw new Error("Unable to save appointment");
    }

    // Google Calendar auto-sync (fail-soft): mirrors the jobs flow so a
    // contractor who connected Google sees the appointment land on their
    // calendar. If the integration isn't connected, refresh fails, or the
    // schema lacks google_event_id, we still return success.
    let googleEventId = null;
    let googleHtmlLink = "";
    let googleSyncError = "";
    if (userId) {
      try {
        const { createGoogleCalendarEvent } = await import(
          "@/lib/google-calendar"
        );
        const start = buildAppointmentStartDate(data.date, data.time) || new Date();
        // Default to 60-minute slot unless an explicit end_time is set.
        const endFromBody = buildAppointmentStartDate(data.date, data.end_time);
        const end = endFromBody || new Date(start.getTime() + 60 * 60 * 1000);
        const event = await createGoogleCalendarEvent({
          userId,
          tenantId: tenantDbId,
          summary: data.title || "Appointment",
          location: data.location || data.client || "",
          description: [
            data.client ? `Client: ${data.client}` : "",
            data.notes ? `Notes: ${data.notes}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        });
        googleEventId = String(event?.id || "");
        googleHtmlLink = String(event?.htmlLink || "");
        if (googleEventId) {
          const { error: updateError } = await supabaseAdmin
            .from("appointments")
            .update({ google_event_id: googleEventId })
            .eq("id", data.id);
          if (updateError && !/column.*does not exist/i.test(updateError.message || "")) {
            console.warn(
              "[api/appointments][POST] persisting google_event_id failed",
              updateError.message,
            );
          } else if (!updateError) {
            data.google_event_id = googleEventId;
          }
        }
      } catch (err) {
        googleSyncError = err?.message || String(err);
        // Suppress the "Google integration not found" noise — it's the
        // expected state for contractors who haven't connected yet.
        if (!/integration not found/i.test(googleSyncError)) {
          console.warn("[api/appointments][POST] Google Calendar sync failed", googleSyncError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...serialize(data),
          google: {
            synced: Boolean(googleEventId),
            eventId: googleEventId,
            htmlLink: googleHtmlLink,
            error: googleSyncError || null,
          },
        },
      }),
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
