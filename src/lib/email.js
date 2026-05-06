import "server-only";
import crypto from "node:crypto";
import { getSenderAddress, isTestEmailDomain } from "@/lib/production-config";
import { supabaseAdmin } from "@/lib/supabase-admin";

const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || "mock")
  .trim()
  .toLowerCase();
const EMAIL_FROM =
  String(process.env.EMAIL_FROM || "FieldBase <no-reply@example.com>").trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const RESEND_TIMEOUT_MS = Number(process.env.RESEND_TIMEOUT_MS || 4000);
const EMAIL_WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET || "";
const ALLOW_INSECURE_DEV_WEBHOOKS =
  String(process.env.ALLOW_INSECURE_DEV_WEBHOOKS || "").trim().toLowerCase() ===
  "dev-local-only";

function isLocalOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function validateResendConfig() {
  if (!RESEND_API_KEY) {
    return "Missing RESEND_API_KEY";
  }

  const senderAddress = getSenderAddress(EMAIL_FROM);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress)) {
    return "EMAIL_FROM must contain a valid sender email address";
  }

  if (process.env.NODE_ENV === "production" && isTestEmailDomain(EMAIL_FROM)) {
    return "EMAIL_FROM must use a verified sending domain in production";
  }

  return "";
}

export function normalizeRecipients(recipients = []) {
  const unique = new Set();
  const valid = [];

  for (const raw of recipients) {
    if (typeof raw !== "string") continue;
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (unique.has(email)) continue;
    unique.add(email);
    valid.push(email);
  }

  return valid;
}

async function sendWithResend({ to, subject, html, text, metadata }) {
  const configError = validateResendConfig();
  if (configError) {
    return {
      success: false,
      provider: "resend",
      error: configError,
    };
  }

  const timeoutMs = Number.isFinite(RESEND_TIMEOUT_MS)
    ? Math.max(1000, Math.min(RESEND_TIMEOUT_MS, 30000))
    : 4000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
        tags: [
          { name: "tenantId", value: metadata?.tenantId || "default" },
          ...(metadata?.campaignId
            ? [{ name: "campaignId", value: String(metadata.campaignId) }]
            : []),
        ],
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        provider: "resend",
        error: payload?.message || `Resend error ${response.status}`,
      };
    }

    return {
      success: true,
      provider: "resend",
      providerMessageId: payload?.id || null,
    };
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    return {
      success: false,
      provider: "resend",
      error: isTimeout
        ? `Resend request timed out after ${timeoutMs}ms`
        : error?.message || "Resend request failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function sendWithMock() {
  return {
    success: true,
    provider: "mock",
    providerMessageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  };
}

export async function sendEmail({ to, subject, html, text, metadata }) {
  if (EMAIL_PROVIDER === "resend") {
    return sendWithResend({ to, subject, html, text, metadata });
  }

  if (EMAIL_PROVIDER === "mock") {
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        provider: "mock",
        error: "EMAIL_PROVIDER=mock is not allowed in production",
      };
    }

    return sendWithMock();
  }

  return {
    success: false,
    provider: EMAIL_PROVIDER,
    error: `Unsupported email provider: ${EMAIL_PROVIDER}`,
  };
}

export async function logEmailAttempt({
  tenantId,
  userId = null,
  createdBy = null,
  recipient,
  provider,
  providerMessageId = null,
  success,
  error = null,
  eventType,
  campaignId = null,
  invoiceId = null,
  invoiceNumber = null,
}) {
  const normalizedTenantId = String(tenantId || "").trim();
  const normalizedRecipient = String(recipient || "").trim().toLowerCase();
  const normalizedEventType = String(eventType || "").trim().toLowerCase();

  if (!normalizedTenantId || !normalizedRecipient || !normalizedEventType) {
    return;
  }

  const nowIso = new Date().toISOString();
  const { error: logError } = await supabaseAdmin.from("email_logs").insert({
    tenant_id: normalizedTenantId,
    user_id: userId || null,
    created_by: createdBy || null,
    campaign_id: campaignId,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    recipient: normalizedRecipient,
    provider: provider || EMAIL_PROVIDER || "unknown",
    provider_message_id: providerMessageId || null,
    status: success ? "sent" : "failed",
    error: error || null,
    event_type: normalizedEventType,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (logError) {
    console.error("[email] failed to insert email log", {
      tenantId: normalizedTenantId,
      recipient: normalizedRecipient,
      eventType: normalizedEventType,
      provider: provider || EMAIL_PROVIDER || "unknown",
      error: logError.message,
    });
  }
}

export function isWebhookAuthorized(request) {
  if (!EMAIL_WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return false;
    }

    const origin = request.headers.get("origin") || "";
    const referer = request.headers.get("referer") || "";
    return (
      ALLOW_INSECURE_DEV_WEBHOOKS &&
      (isLocalOrigin(origin) || isLocalOrigin(referer))
    );
  }

  const direct = (request.headers.get("x-email-webhook-secret") || "").trim();
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const safeEqual = (left, right) => {
    if (!left || !right) return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  };

  return (
    safeEqual(direct, EMAIL_WEBHOOK_SECRET) ||
    safeEqual(bearer, EMAIL_WEBHOOK_SECRET)
  );
}

export function normalizeEventStatus(raw) {
  const value = String(raw || "").toLowerCase();
  if (!value) return "unknown";

  if (value.includes("deliver")) return "delivered";
  if (value.includes("open")) return "opened";
  if (value.includes("click")) return "clicked";
  if (value.includes("bounce")) return "bounced";
  if (value.includes("complaint") || value.includes("spam"))
    return "complained";
  if (value.includes("reply") || value.includes("replied")) return "replied";
  if (value.includes("fail") || value.includes("reject")) return "failed";
  if (value.includes("send") || value.includes("sent")) return "sent";

  return value;
}

export function chunkArray(items, size) {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
