import { enforceSameOriginForMutation } from "@/lib/request-security";
import { sendEmail } from "@/lib/email";
import { sendTextMessage } from "@/lib/sms";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ESTIMATES_TABLE = "estimates";

const ALLOWED_STATUSES = new Set([
  "draft",
  "sent",
  "approved",
  "declined",
  "changes_requested",
]);

function normalizeStatus(value, fallback = "draft") {
  const normalized = String(value || "").trim().toLowerCase();
  if (ALLOWED_STATUSES.has(normalized)) return normalized;
  return fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNotes(notes) {
  const raw = String(notes || "").trim();
  if (!raw) {
    return {
      address: "",
      noteText: "",
      clientEmail: "",
      clientPhone: "",
      audit: {
        sentAt: "",
        approvedAt: "",
        declinedAt: "",
        changesRequestedAt: "",
        resentAt: "",
        resendCount: 0,
      },
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.kind === "estimate_pipeline") {
      return {
        address: String(parsed.address || ""),
        noteText: String(parsed.noteText || ""),
        clientEmail: String(parsed.clientEmail || ""),
        clientPhone: String(parsed.clientPhone || ""),
        audit: {
          sentAt: String(parsed.audit?.sentAt || ""),
          approvedAt: String(parsed.audit?.approvedAt || ""),
          declinedAt: String(parsed.audit?.declinedAt || ""),
          changesRequestedAt: String(parsed.audit?.changesRequestedAt || ""),
          resentAt: String(parsed.audit?.resentAt || ""),
          resendCount: Number(parsed.audit?.resendCount || 0),
        },
      };
    }
  } catch {
    // Legacy notes are plain text.
  }
  return {
    address: "",
    noteText: raw,
    clientEmail: "",
    clientPhone: "",
    audit: {
      sentAt: "",
      approvedAt: "",
      declinedAt: "",
      changesRequestedAt: "",
      resentAt: "",
      resendCount: 0,
    },
  };
}

function buildAuditForCreate(status, nowIso) {
  const normalizedStatus = normalizeStatus(status);
  return {
    sentAt: normalizedStatus === "sent" ? nowIso : "",
    approvedAt: normalizedStatus === "approved" ? nowIso : "",
    declinedAt: normalizedStatus === "declined" ? nowIso : "",
    changesRequestedAt: normalizedStatus === "changes_requested" ? nowIso : "",
    resentAt: "",
    resendCount: 0,
  };
}

function stringifyNotes({ address = "", noteText = "", clientEmail = "", clientPhone = "", audit = {} }) {
  return JSON.stringify({
    kind: "estimate_pipeline",
    address: String(address || ""),
    noteText: String(noteText || ""),
    clientEmail: String(clientEmail || ""),
    clientPhone: String(clientPhone || ""),
    audit: {
      sentAt: String(audit.sentAt || ""),
      approvedAt: String(audit.approvedAt || ""),
      declinedAt: String(audit.declinedAt || ""),
      changesRequestedAt: String(audit.changesRequestedAt || ""),
      resentAt: String(audit.resentAt || ""),
      resendCount: Number(audit.resendCount || 0),
    },
  });
}

function serializeEstimate(row) {
  const parsedNotes = parseNotes(row.notes);
  const services = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    _id: row.id,
    tenantId: row.tenant_id || null,
    userId: row.user_id || null,
    createdBy: row.created_by || null,
    clientName: row.client_name || "",
    clientEmail: parsedNotes.clientEmail || "",
    clientPhone: parsedNotes.clientPhone || "",
    address: parsedNotes.address,
    status: normalizeStatus(row.status),
    services,
    subtotal: toNumber(row.subtotal),
    tax: toNumber(row.tax),
    total: toNumber(row.total),
    notes: parsedNotes.noteText,
    audit: parsedNotes.audit,
    estimateNumber: row.estimate_number || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function buildEstimateRow(body = {}, nowIso) {
  const services = Array.isArray(body.services) ? body.services : [];
  const subtotal = toNumber(body.subtotal);
  const tax = toNumber(body.tax);
  const total = toNumber(body.total, subtotal + tax);
  const normalizedStatus = normalizeStatus(body.status);
  return {
    client_name: String(body.clientName || "").trim(),
    status: normalizedStatus,
    items: services,
    subtotal,
    tax,
    total,
    notes: stringifyNotes({
      address: String(body.address || "").trim(),
      noteText: String(body.notes || ""),
      clientEmail: String(body.clientEmail || "").trim().toLowerCase(),
      clientPhone: String(body.clientPhone || "").trim(),
      audit: buildAuditForCreate(normalizedStatus, nowIso),
    }),
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    let query = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("*")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return jsonResponse({
      success: true,
      data: (data || []).map(serializeEstimate),
    });
  } catch (error) {
    console.error("[api/estimates][GET] error", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const { tenantDbId, userId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const nowIso = new Date().toISOString();
    const mapped = buildEstimateRow(body, nowIso);
    if (!mapped.client_name) {
      return jsonResponse({ success: false, error: "Client name is required" }, 400);
    }

    const estimateNumber = String(body.estimateNumber || "").trim() ||
      `EST-${String(Date.now()).slice(-6)}`;

    const { data, error } = await supabaseAdmin
      .from(ESTIMATES_TABLE)
      .insert({
        ...mapped,
        estimate_number: estimateNumber,
        currency: "USD",
        tenant_id: tenantDbId,
        user_id: userId || null,
        created_by: userId || null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const serialized = serializeEstimate(data);

    const channels = body?.sendChannels && typeof body.sendChannels === "object"
      ? body.sendChannels
      : {};
    const sendViaEmail = channels.email !== false;
    const sendViaText = channels.text === true;

    // Send selected notifications when estimate is sent
    if (serialized.status === "sent" && sendViaEmail && serialized.clientEmail) {
      const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const estimateLink = `${appUrl}/estimate/${serialized.id}`;
      const clientName = serialized.clientName || "Friend";
      const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(serialized.total || 0);
      await sendEmail({
        to: [serialized.clientEmail],
        subject: `Your Estimate is Ready — ${serialized.estimateNumber || serialized.id}`,
        text: `Hi ${clientName},\n\nYour estimate for ${total} is ready for review.\n\nView and respond here:\n${estimateLink}\n\nThank you!`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="color:#0f172a;margin-bottom:8px">Your Estimate is Ready</h2>
            <p style="color:#475569;margin-bottom:16px">Hi ${clientName},</p>
            <p style="color:#475569">Your estimate has been prepared. Please review the details and let us know how you'd like to proceed.</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Total</div>
              <div style="color:#0f172a;font-size:24px;font-weight:700">${total}</div>
            </div>
            <a href="${estimateLink}" style="display:inline-block;background:#059669;color:#fff;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:16px">
              View Estimate &amp; Respond
            </a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px">If the button doesn't work, copy this link:<br><a href="${estimateLink}" style="color:#3b82f6">${estimateLink}</a></p>
          </div>`,
      }).catch((emailErr) => {
        console.warn("[api/estimates][POST] email send failed:", emailErr?.message);
      });
    }

    if (serialized.status === "sent" && sendViaText && serialized.clientPhone) {
      const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const estimateLink = `${appUrl}/estimate/${serialized.id}`;
      const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(serialized.total || 0);
      const text = `Your estimate for ${total} is ready: ${estimateLink}`;
      await sendTextMessage({
        to: serialized.clientPhone,
        text,
      }).catch((smsErr) => {
        console.warn("[api/estimates][POST] sms send failed:", smsErr?.message);
      });
    }

    return jsonResponse({ success: true, data: serialized });
  } catch (error) {
    console.error("[api/estimates][POST] error", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}