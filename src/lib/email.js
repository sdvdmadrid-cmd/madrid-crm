import "server-only";
import crypto from "node:crypto";
import { getSenderAddress, isTestEmailDomain } from "@/lib/production-config";

const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || "mock").toLowerCase();
const EMAIL_FROM =
  process.env.EMAIL_FROM || "ContractorFlow <no-reply@example.com>";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET || "";
const ALLOW_INSECURE_DEV_WEBHOOKS =
  String(process.env.ALLOW_INSECURE_DEV_WEBHOOKS || "false").toLowerCase() ===
  "true";

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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
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

  return sendWithMock();
}

export function isWebhookAuthorized(request) {
  if (!EMAIL_WEBHOOK_SECRET) {
    return process.env.NODE_ENV !== "production" && ALLOW_INSECURE_DEV_WEBHOOKS;
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
