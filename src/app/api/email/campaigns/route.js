import { chunkArray, normalizeRecipients, sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const CAMPAIGNS = "email_campaigns";
const LOGS = "email_logs";

const serializeCampaign = (doc) => ({
  ...doc,
  _id: doc.id,
  tenantId: doc.tenant_id || "",
  createdBy: doc.created_by || null,
  createdAt: doc.created_at || null,
  completedAt: doc.completed_at || null,
});

async function resolveRecipients(tenantId, role, clientIds, directRecipients) {
  const merged = [];

  if (Array.isArray(directRecipients)) {
    merged.push(...directRecipients);
  }

  if (Array.isArray(clientIds) && clientIds.length > 0) {
    let clientsQuery = supabaseAdmin
      .from("clients")
      .select("email")
      .in(
        "id",
        clientIds.map((id) => String(id)),
      );

    if ((role || "").toLowerCase() !== "super_admin") {
      clientsQuery = clientsQuery.eq("tenant_id", tenantId);
    }

    const { data } = await clientsQuery;
    for (const client of data || []) {
      if (client?.email) merged.push(client.email);
    }
  }

  return normalizeRecipients(merged);
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") || 20), 1),
      100,
    );

    let query = supabaseAdmin
      .from(CAMPAIGNS)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[api/email/campaigns][GET] Supabase query error", error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify((data || []).map(serializeCampaign)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/email/campaigns][GET] error", error);
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
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const subject = String(body.subject || "").trim();
    const html = typeof body.html === "string" ? body.html : "";
    const text = typeof body.text === "string" ? body.text : "";

    if (!subject) {
      return new Response(
        JSON.stringify({ success: false, error: "Subject is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!html && !text) {
      return new Response(
        JSON.stringify({ success: false, error: "html or text is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const batchSize = Math.min(Math.max(Number(body.batchSize || 50), 1), 200);

    const recipients = await resolveRecipients(
      tenantDbId,
      role,
      body.clientIds || [],
      body.recipients || [],
    );

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid recipients found" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const nowIso = new Date().toISOString();
    const campaignDoc = {
      tenant_id: tenantDbId,
      name: body.name || `Campaign ${nowIso}`,
      subject,
      html,
      text,
      created_by: userId || null,
      total: recipients.length,
      sent: 0,
      failed: 0,
      metrics: {
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        complained: 0,
        replied: 0,
      },
      status: "processing",
      batch_size: batchSize,
      created_at: nowIso,
      updated_at: nowIso,
      completed_at: null,
    };

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from(CAMPAIGNS)
      .insert(campaignDoc)
      .select("*")
      .single();
    if (campaignError) {
      console.error(
        "[api/email/campaigns][POST] Supabase campaign insert error",
        campaignError,
      );
      throw new Error(campaignError.message);
    }

    let sent = 0;
    let failed = 0;

    for (const batch of chunkArray(recipients, batchSize)) {
      const results = await Promise.all(
        batch.map(async (email) => {
          const result = await sendEmail({
            to: email,
            subject,
            html,
            text,
            metadata: {
              tenantId: tenantDbId,
              campaignId: campaign.id,
              recipient: email,
            },
          });

          if (result.success) sent += 1;
          else failed += 1;

          return {
            tenant_id: tenantDbId,
            user_id: userId || null,
            campaign_id: campaign.id,
            recipient: email,
            provider: result.provider,
            provider_message_id: result.providerMessageId || null,
            status: result.success ? "sent" : "failed",
            error: result.error || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }),
      );

      if (results.length > 0) {
        const { error: logsError } = await supabaseAdmin
          .from(LOGS)
          .insert(results);
        if (logsError) {
          console.error(
            "[api/email/campaigns][POST] Supabase log insert error",
            logsError,
          );
        }
      }
    }

    const finalStatus =
      failed > 0
        ? sent > 0
          ? "completed_with_errors"
          : "failed"
        : "completed";

    const { error: campaignUpdateError } = await supabaseAdmin
      .from(CAMPAIGNS)
      .update({
        sent,
        failed,
        status: finalStatus,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
    if (campaignUpdateError) {
      console.error(
        "[api/email/campaigns][POST] Supabase campaign update error",
        campaignUpdateError,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          campaignId: campaign.id,
          total: recipients.length,
          sent,
          failed,
          status: finalStatus,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/email/campaigns][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
