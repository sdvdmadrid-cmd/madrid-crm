import { isWebhookAuthorized, normalizeEventStatus } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CAMPAIGNS = "email_campaigns";
const LOGS = "email_logs";

function parseEvent(item = {}) {
  const meta = item.metadata || item.meta || {};
  const statusRaw = item.event || item.type || item.status || item.eventType;
  const status = normalizeEventStatus(statusRaw);

  return {
    provider: item.provider || item.source || "unknown",
    providerMessageId:
      item.providerMessageId ||
      item.messageId ||
      item.email_id ||
      item.data?.email_id ||
      null,
    campaignId: item.campaignId || meta.campaignId || null,
    tenantId: item.tenantId || meta.tenantId || "",
    recipient: String(item.recipient || item.email || item.to || "")
      .toLowerCase()
      .trim(),
    status,
    eventType: String(statusRaw || status),
    error: item.error || item.reason || null,
    timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
  };
}

export async function POST(request) {
  try {
    if (!isWebhookAuthorized(request)) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized webhook" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();
    const events = Array.isArray(body)
      ? body
      : Array.isArray(body.events)
        ? body.events
        : [body];

    let processed = 0;
    let unmatched = 0;

    for (const item of events) {
      const event = parseEvent(item);

      if (!event.tenantId) {
        console.error("[api/email/webhooks/events][POST] Missing tenantId in event payload", event);
        unmatched += 1;
        continue;
      }

      let query = supabaseAdmin
        .from(LOGS)
        .select("*")
        .eq("tenant_id", event.tenantId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (event.providerMessageId)
        query = query.eq("provider_message_id", event.providerMessageId);
      if (event.campaignId) query = query.eq("campaign_id", event.campaignId);
      if (event.recipient) query = query.eq("recipient", event.recipient);

      const { data: logs, error: logError } = await query;
      if (logError) {
        console.error("[api/email/webhooks/events][POST] Supabase log query error", logError);
        throw new Error(logError.message);
      }

      const log = logs?.[0] || null;
      if (!log) {
        unmatched += 1;
        continue;
      }

      const eventDateIso = new Date(
        event.timestamp || Date.now(),
      ).toISOString();

      const { error: updateLogError } = await supabaseAdmin
        .from(LOGS)
        .update({
          status: event.status,
          event_type: event.eventType,
          error: event.error,
          updated_at: new Date().toISOString(),
          last_event_at: eventDateIso,
        })
        .eq("id", log.id);

      if (updateLogError) {
        console.error("[api/email/webhooks/events][POST] Supabase log update error", updateLogError);
        throw new Error(updateLogError.message);
      }

      const metricStatus = [
        "delivered",
        "opened",
        "clicked",
        "bounced",
        "complained",
        "replied",
      ].includes(event.status)
        ? event.status
        : null;

      if (metricStatus && (log.campaign_id || event.campaignId)) {
        const campaignId = log.campaign_id || event.campaignId;
        const { data: campaign } = await supabaseAdmin
          .from(CAMPAIGNS)
          .select("id,metrics")
          .eq("id", campaignId)
          .maybeSingle();

        if (campaign) {
          const metrics = {
            delivered: 0,
            opened: 0,
            clicked: 0,
            bounced: 0,
            complained: 0,
            replied: 0,
            ...(campaign.metrics || {}),
          };
          metrics[metricStatus] = Number(metrics[metricStatus] || 0) + 1;

          const { error: updateCampaignError } = await supabaseAdmin
            .from(CAMPAIGNS)
            .update({ metrics, updated_at: new Date().toISOString() })
            .eq("id", campaign.id);
          if (updateCampaignError) {
            console.error("[api/email/webhooks/events][POST] Supabase campaign update error", updateCampaignError);
            throw new Error(updateCampaignError.message);
          }
        }
      }

      processed += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        unmatched,
        total: events.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/email/webhooks/events][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
