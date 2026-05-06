import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

const VERIFICATION_EVENT_TYPES = [
  "signup_verification",
  "signup_verification_resend",
];

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(parsed, 100));
}

export async function GET(request) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated || role !== "super_admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { searchParams } = new URL(request.url);
    const email = String(searchParams.get("email") || "")
      .trim()
      .toLowerCase();
    const limit = normalizeLimit(searchParams.get("limit"));

    let query = supabaseAdmin
      .from("email_logs")
      .select(
        "id,tenant_id,user_id,recipient,provider,provider_message_id,status,error,event_type,created_at,updated_at,last_event_at",
      )
      .in("event_type", VERIFICATION_EVENT_TYPES)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (email) {
      query = query.eq("recipient", email);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const rows = (data || []).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      recipient: row.recipient,
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      status: row.status,
      error: row.error,
      eventType: row.event_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastEventAt: row.last_event_at,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          rows,
          email,
          count: rows.length,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/admin/email-logs] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unable to load email logs",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}