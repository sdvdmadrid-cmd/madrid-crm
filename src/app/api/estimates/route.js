import {
  buildPublicEstimateLink,
  isPublicEstimateStatus,
} from "@/lib/estimate-public-access";
import { deliverEstimateNotifications } from "@/lib/estimate-notifications";
import { enforceSameOriginForMutation } from "@/lib/request-security";
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
  const status = normalizeStatus(row.status);
  const publicLink =
    isPublicEstimateStatus(status) && row.id ? buildPublicEstimateLink(row.id) : null;

  return {
    id: row.id,
    _id: row.id,
    tenantId: row.tenant_id || null,
    publicLink,
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

/**
 * Generate the next EST-#### identifier for a tenant.
 *
 * The previous implementation used `COUNT(*) + 1`, which is vulnerable to a
 * race where two concurrent creations produce the same number. We now pick
 * the highest existing EST-#### suffix and add one. The same-origin guard +
 * unique index on (tenant_id, estimate_number) added in the companion
 * migration are what make this safe under contention.
 */
async function nextEstimateNumber(tenantId) {
  const { data, error } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .select("estimate_number")
    .eq("tenant_id", tenantId)
    .ilike("estimate_number", "EST-%")
    .order("estimate_number", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  let max = 0;
  for (const row of data || []) {
    const match = String(row.estimate_number || "").match(/^EST-(\d+)$/i);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `EST-${String(max + 1).padStart(4, "0")}`;
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

    const userProvidedNumber = String(body.estimateNumber || "").trim();

    // Insert with retry on unique-constraint violation. Under concurrent
    // creates two callers can compute the same EST-####, and the partial
    // unique index added in 20260528200000 will reject the second insert.
    // We retry with a freshly-computed number a few times before giving up.
    let data = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const estimateNumber =
        attempt === 0 && userProvidedNumber
          ? userProvidedNumber
          : await nextEstimateNumber(tenantDbId);

      const insertResult = await supabaseAdmin
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

      if (!insertResult.error) {
        data = insertResult.data;
        lastError = null;
        break;
      }
      lastError = insertResult.error;
      const code = String(insertResult.error.code || "");
      const msg = String(insertResult.error.message || "");
      const isUniqueViolation = code === "23505" || /duplicate key value/i.test(msg);
      if (!isUniqueViolation) break;
      if (userProvidedNumber && attempt === 0) {
        // The user explicitly chose a number that collides. Surface a
        // friendly 409 instead of looping.
        return jsonResponse(
          { success: false, error: `Estimate number ${userProvidedNumber} is already in use.` },
          409,
        );
      }
      // Otherwise loop and pick the next available number.
    }

    if (lastError) throw new Error(lastError.message);
    if (!data) throw new Error("Failed to allocate a unique estimate number");

    const serialized = serializeEstimate(data);

    const delivery = await deliverEstimateNotifications({
      estimate: serialized,
      sendChannels: body?.sendChannels,
      requestedStatus: serialized.status,
      contextLabel: "api/estimates][POST",
    });

    return jsonResponse({ success: true, data: { ...serialized, delivery } });
  } catch (error) {
    console.error("[api/estimates][POST] error", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}