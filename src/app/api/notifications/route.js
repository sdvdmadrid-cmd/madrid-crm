import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const TABLE = "notifications";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getNotificationsSchemaError(error) {
  const message = String(error?.message || "");

  if (
    /Could not find the table 'public\.notifications' in the schema cache/i.test(
      message,
    )
  ) {
    return "Notifications data is unavailable because the Supabase notifications table is missing or the schema cache has not reloaded yet. Run the notifications migration and reload the PostgREST schema cache.";
  }

  if (/relation\s+"?public\.notifications"?\s+does not exist/i.test(message)) {
    return "Notifications data is unavailable because the Supabase notifications table does not exist yet. Run the notifications migration first.";
  }

  return "";
}

function handleNotificationsError(error, fallbackMessage) {
  const schemaError = getNotificationsSchemaError(error);
  if (schemaError) {
    return jsonResponse({ success: false, error: schemaError }, 503);
  }

  return jsonResponse(
    {
      success: false,
      error: fallbackMessage,
    },
    500,
  );
}

const serialize = (doc) => ({
  _id: doc.id,
  tenantId: doc.tenant_id || "default",
  type: doc.type || "info",
  title: doc.title || "",
  message: doc.message || "",
  jobId: doc.job_id || doc.jobId || "",
  jobTitle: doc.job_title || doc.jobTitle || "",
  clientName: doc.client_name || doc.clientName || "",
  quoteToken: doc.quote_token || doc.quoteToken || "",
  read: Boolean(doc.read),
  createdAt: doc.created_at || null,
});

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    let query = supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(30);

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[api/notifications][GET] Supabase query error", error);
      throw error;
    }

    return jsonResponse({ success: true, data: (data || []).map(serialize) });
  } catch (error) {
    console.error("[api/notifications][GET] error", error);
    return handleNotificationsError(
      error,
      "Unable to load notifications right now.",
    );
  }
}

export async function PATCH(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();

    if (id) {
      let query = supabaseAdmin
        .from(TABLE)
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq("id", id);

      if ((role || "").toLowerCase() !== "super_admin") {
        query = query.eq("tenant_id", tenantDbId);
      }

      const { error } = await query;
      if (error) {
        console.error(
          "[api/notifications][PATCH] Supabase update error",
          error,
        );
        throw error;
      }
    } else {
      let query = supabaseAdmin
        .from(TABLE)
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq("read", false);

      if ((role || "").toLowerCase() !== "super_admin") {
        query = query.eq("tenant_id", tenantDbId);
      }

      const { error } = await query;
      if (error) {
        console.error(
          "[api/notifications][PATCH] Supabase bulk update error",
          error,
        );
        throw error;
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("[api/notifications][PATCH] error", error);
    return handleNotificationsError(
      error,
      "Unable to update notifications right now.",
    );
  }
}
