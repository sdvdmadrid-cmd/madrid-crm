import "server-only";

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TABLE = "review_requests";

const VALID_CHANNELS = new Set(["email", "sms", "both", "manual"]);

export function generateReviewRequestToken() {
  // 24 bytes = 32 char URL-safe base64; plenty of entropy and short enough
  // to comfortably fit in a printed/QR'd link.
  return crypto.randomBytes(24).toString("base64url");
}

export function serializeReviewRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobId: row.job_id || null,
    invoiceId: row.invoice_id || null,
    estimateId: row.estimate_id || null,
    customerName: row.customer_name || "",
    customerEmail: row.customer_email || "",
    customerPhone: row.customer_phone || "",
    status: row.status || "sent",
    channel: row.channel || "email",
    message: row.message || "",
    reviewId: row.review_id || null,
    rating: row.rating != null ? Number(row.rating) : null,
    expiresAt: row.expires_at || null,
    respondedAt: row.responded_at || null,
    revokedAt: row.revoked_at || null,
    reminderSentAt: row.reminder_sent_at || null,
    createdAt: row.created_at || null,
  };
}

export function normalizeChannel(value) {
  const key = String(value || "email").trim().toLowerCase();
  return VALID_CHANNELS.has(key) ? key : "email";
}

/**
 * Insert a new review-request row. Returns the persisted, serialized
 * record (including the freshly-minted token so callers can embed it in
 * the outbound email/SMS link).
 */
export async function createReviewRequest({
  tenantId,
  requestedByUserId = null,
  customerName = "",
  customerEmail = "",
  customerPhone = "",
  jobId = null,
  invoiceId = null,
  estimateId = null,
  message = "",
  channel = "email",
}) {
  const safeTenant = String(tenantId || "").trim();
  if (!safeTenant) throw new Error("tenantId is required to create a review request");
  const email = String(customerEmail || "").trim().slice(0, 200);
  const phone = String(customerPhone || "").trim().slice(0, 60);
  if (!email && !phone) {
    throw new Error("Either a customer email or phone is required");
  }

  const token = generateReviewRequestToken();
  const payload = {
    tenant_id: safeTenant,
    requested_by_user_id: requestedByUserId || null,
    customer_name: String(customerName || "").trim().slice(0, 200),
    customer_email: email,
    customer_phone: phone,
    job_id: jobId || null,
    invoice_id: invoiceId || null,
    estimate_id: estimateId || null,
    message: String(message || "").trim().slice(0, 1000),
    channel: normalizeChannel(channel),
    token,
    status: "sent",
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return serializeReviewRequest(data);
}

/**
 * Look up a request by its opaque token. Returns null when not found
 * (the public route uses this — it deliberately doesn't differentiate
 * between not-found and expired/revoked to keep token enumeration noisy).
 */
export async function findReviewRequestByToken(token) {
  const value = String(token || "").trim();
  if (!value || value.length < 16) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("token", value)
      .maybeSingle();
    if (error) {
      if (error.code === "42P01") return null;
      throw error;
    }
    return data || null;
  } catch (err) {
    console.warn(
      "[review-requests] findReviewRequestByToken failed",
      err?.message || err,
    );
    return null;
  }
}

export function isReviewRequestUsable(row) {
  if (!row) return false;
  if (row.revoked_at) return false;
  if (row.status === "revoked") return false;
  if (row.status === "responded") return false;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return false;
  return true;
}

export async function listTenantReviewRequests(tenantId, { limit = 50 } = {}) {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (error.code === "42P01") return [];
      throw error;
    }
    return (data || []).map(serializeReviewRequest);
  } catch (err) {
    console.warn(
      "[review-requests] listTenantReviewRequests failed",
      err?.message || err,
    );
    return [];
  }
}

/**
 * Mark a request as responded after a customer submits the public form.
 * Records the review id + the rating so the contractor can see how the
 * customer rated without joining to the reviews table.
 */
export async function markReviewRequestResponded({
  id,
  reviewId,
  rating = null,
}) {
  if (!id) return;
  try {
    await supabaseAdmin
      .from(TABLE)
      .update({
        status: "responded",
        review_id: reviewId || null,
        rating: rating != null ? Number(rating) : null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch (err) {
    console.warn(
      "[review-requests] markReviewRequestResponded failed",
      err?.message || err,
    );
  }
}

export async function revokeReviewRequest({ tenantId, id }) {
  if (!id) return false;
  try {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", id);
    return !error;
  } catch (err) {
    console.warn("[review-requests] revoke failed", err?.message || err);
    return false;
  }
}
