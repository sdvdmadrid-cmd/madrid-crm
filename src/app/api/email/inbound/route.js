import { isWebhookAuthorized, normalizeRecipients } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";

const INBOUND = "email_inbound";
const LOGS = "email_logs";
const CAMPAIGNS = "email_campaigns";

function pickText(body) {
  if (typeof body.text === "string" && body.text.trim()) return body.text;
  if (typeof body.textBody === "string" && body.textBody.trim())
    return body.textBody;
  return "";
}

function pickHtml(body) {
  if (typeof body.html === "string" && body.html.trim()) return body.html;
  if (typeof body.htmlBody === "string" && body.htmlBody.trim())
    return body.htmlBody;
  return "";
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
    const tenantId = String(body.tenantId || body.metadata?.tenantId || "").trim();
    if (!tenantId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing tenantId" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const from =
      normalizeRecipients([body.from || body.sender || body.emailFrom])[0] ||
      "";
    if (!from) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing valid from email" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const subject = String(body.subject || "");
    const text = pickText(body);
    const html = pickHtml(body);
    const campaignId = body.campaignId || body.metadata?.campaignId || null;

    const nowIso = new Date().toISOString();

    const inboundDoc = {
      tenant_id: tenantId,
      user_id: null,
      provider: body.provider || "unknown",
      from,
      to: body.to || body.recipient || null,
      subject,
      text,
      html,
      campaign_id: campaignId,
      provider_message_id: body.providerMessageId || body.messageId || null,
      in_reply_to: body.inReplyTo || null,
      status: "received",
      received_at: nowIso,
      raw: body,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: inbound, error: inboundError } = await supabaseAdmin
      .from(INBOUND)
      .insert(inboundDoc)
      .select("*")
      .single();

    if (inboundError) {
      console.error("[api/email/inbound][POST] Supabase inbound insert error", inboundError);
      throw new Error(inboundError.message);
    }

    let logQuery = supabaseAdmin
      .from(LOGS)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("recipient", from)
      .order("created_at", { ascending: false })
      .limit(1);

    if (campaignId) {
      logQuery = logQuery.eq("campaign_id", campaignId);
    }

    const { data: logs, error: logError } = await logQuery;
    if (logError) {
      console.error("[api/email/inbound][POST] Supabase log query error", logError);
      throw new Error(logError.message);
    }

    const log = logs?.[0] || null;

    if (log) {
      const { error: updateLogError } = await supabaseAdmin
        .from(LOGS)
        .update({
          status: "replied",
          event_type: "inbound_reply",
          updated_at: nowIso,
          last_event_at: nowIso,
        })
        .eq("id", log.id);
      if (updateLogError) {
        console.error("[api/email/inbound][POST] Supabase log update error", updateLogError);
        throw new Error(updateLogError.message);
      }
    }

    const campaignIdToUse = campaignId || log?.campaign_id || null;
    if (campaignIdToUse) {
      const { error: updateCampaignError } = await supabaseAdmin
        .from(CAMPAIGNS)
        .update({ updated_at: nowIso })
        .eq("id", campaignIdToUse);
      if (updateCampaignError) {
        console.error("[api/email/inbound][POST] Supabase campaign update error", updateCampaignError);
        throw new Error(updateCampaignError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          inboundId: inbound.id,
          linkedToLog: Boolean(log),
          tenantId,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/email/inbound][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
