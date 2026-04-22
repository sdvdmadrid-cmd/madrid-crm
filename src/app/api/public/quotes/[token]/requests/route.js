import {
  checkPublicQuoteRateLimit,
  getRequestIp,
  recordPublicQuoteAttempt,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const JOBS = "jobs";
const ESTIMATE_REQUESTS = "estimate_requests";
const NOTIFICATIONS = "notifications";

function isValidQuoteToken(value) {
  const token = String(value || "").trim();
  return token.length >= 24 && /^[a-zA-Z0-9_-]+$/.test(token);
}

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const quoteToken = String(token || "").trim();

    if (!isValidQuoteToken(quoteToken)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const ip = getRequestIp(request);
    const limitState = await checkPublicQuoteRateLimit({
      token: quoteToken,
      ip,
      action: "request",
    });
    if (!limitState.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Too many requests. Please try again shortly.",
          code: "RATE_LIMITED",
          retryAfterSeconds: limitState.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(limitState.retryAfterSeconds),
          },
        },
      );
    }

    await recordPublicQuoteAttempt({
      token: quoteToken,
      ip,
      action: "request",
    });

    const body = await request.json();
    const requestType = String(body.requestType || "change").toLowerCase();
    const allowedTypes = new Set(["change", "remove", "add", "other"]);
    const type = allowedTypes.has(requestType) ? requestType : "change";

    const item = String(body.item || "")
      .trim()
      .slice(0, 200);
    const message = String(body.message || "")
      .trim()
      .slice(0, 2000);
    const contactName = String(body.contactName || "")
      .trim()
      .slice(0, 100);
    const contactEmail = String(body.contactEmail || "")
      .trim()
      .slice(0, 160);
    const contactPhone = String(body.contactPhone || "")
      .trim()
      .slice(0, 60);

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: "Message is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from(JOBS)
      .select("*")
      .eq("quote_token", quoteToken)
      .maybeSingle();
    if (jobError) {
      console.error(
        "[api/public/quotes/:token/requests][POST] Supabase job query error",
        jobError,
      );
      throw new Error(jobError.message);
    }

    if (!job) {
      return new Response(
        JSON.stringify({ success: false, error: "Quote not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const expectedRecipient = String(job.quote_sent_to || "")
      .trim()
      .toLowerCase();
    if (
      expectedRecipient &&
      contactEmail.trim().toLowerCase() !== expectedRecipient
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Request email must match the original quote recipient",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const now = new Date();
    const tenantId = job.tenant_id || "default";

    const toInsert = {
      tenant_id: tenantId,
      user_id: null,
      job_id: job.id,
      quote_token: quoteToken,
      request_type: type,
      item,
      message,
      client_name: job.client_name || "",
      job_title: job.title || "",
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      status: "pending",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from(ESTIMATE_REQUESTS)
      .insert(toInsert)
      .select("*")
      .maybeSingle();
    if (requestError) {
      console.error(
        "[api/public/quotes/:token/requests][POST] Supabase estimate request insert error",
        requestError,
      );
      throw new Error(requestError.message);
    }

    const { error: updateError } = await supabaseAdmin
      .from(JOBS)
      .update({
        quote_status: "changes_requested",
        updated_at: now.toISOString(),
      })
      .eq("id", job.id)
      .eq("tenant_id", tenantId);
    if (updateError) {
      console.error(
        "[api/public/quotes/:token/requests][POST] Supabase job update error",
        updateError,
      );
      throw new Error(updateError.message);
    }

    // Push in-app notification for contractor
    const contactDisplay = contactName || job.client_name || "Client";
    const notifMessage = item
      ? `${contactDisplay} wants to ${type} "${item}": ${message.slice(0, 120)}${message.length > 120 ? "…" : ""}`
      : `${contactDisplay} requested changes: ${message.slice(0, 140)}${message.length > 140 ? "…" : ""}`;

    const { error: notificationError } = await supabaseAdmin
      .from(NOTIFICATIONS)
      .insert({
        tenant_id: tenantId,
        user_id: null,
        type: "changes_requested",
        title: `Changes requested — ${job.title || "Quote"}`,
        message: notifMessage,
        job_id: job.id,
        job_title: job.title || "",
        client_name: contactDisplay,
        quote_token: quoteToken,
        client_message: message,
        read: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    if (notificationError) {
      console.error(
        "[api/public/quotes/:token/requests][POST] Supabase notification insert error",
        notificationError,
      );
      throw new Error(notificationError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          _id: requestRow?.id || `${quoteToken}-${Date.now()}`,
          tenantId,
          jobId: job.id,
          quoteToken,
          requestType: type,
          item,
          message,
          clientName: job.client_name || "",
          jobTitle: job.title || "",
          contactName,
          contactEmail,
          contactPhone,
          status: "pending",
          createdAt: requestRow?.created_at || now.toISOString(),
          updatedAt: requestRow?.updated_at || now.toISOString(),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/public/quotes/:token/requests][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
