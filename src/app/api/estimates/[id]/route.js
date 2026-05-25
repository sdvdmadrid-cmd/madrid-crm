import {
  buildPublicEstimateLink,
  isPublicEstimateStatus,
  normalizeEstimateStatus,
} from "@/lib/estimate-public-access";
import { deliverEstimateNotifications } from "@/lib/estimate-notifications";
import { recordEstimateRevision } from "@/lib/estimate-revisions";
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
      const signature =
        parsed.audit?.signature && typeof parsed.audit.signature === "object"
          ? {
              name: String(parsed.audit.signature.name || ""),
              signedAt: String(parsed.audit.signature.signedAt || ""),
              ip: String(parsed.audit.signature.ip || ""),
            }
          : null;
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
          signature,
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
      signature: null,
    },
  };
}

function stringifyNotes({ address = "", noteText = "", clientEmail = "", clientPhone = "", audit = {} }) {
  // Carry the signature through if the customer signed previously, so a
  // subsequent contractor PATCH doesn't accidentally wipe the audit trail.
  const signature =
    audit.signature && typeof audit.signature === "object"
      ? {
          name: String(audit.signature.name || ""),
          signedAt: String(audit.signature.signedAt || ""),
          ip: String(audit.signature.ip || ""),
        }
      : null;
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
      ...(signature ? { signature } : {}),
    },
  });
}

function withStatusAudit(existingAudit, previousStatus, nextStatus, nowIso) {
  const audit = {
    sentAt: String(existingAudit?.sentAt || ""),
    approvedAt: String(existingAudit?.approvedAt || ""),
    declinedAt: String(existingAudit?.declinedAt || ""),
    changesRequestedAt: String(existingAudit?.changesRequestedAt || ""),
    resentAt: String(existingAudit?.resentAt || ""),
    resendCount: Number(existingAudit?.resendCount || 0),
    signature:
      existingAudit?.signature && typeof existingAudit.signature === "object"
        ? existingAudit.signature
        : null,
  };

  if (!nextStatus || nextStatus === previousStatus) return audit;

  if (nextStatus === "sent") {
    if (!audit.sentAt) {
      audit.sentAt = nowIso;
    } else if (previousStatus === "changes_requested") {
      audit.resentAt = nowIso;
      audit.resendCount += 1;
    }
  }
  if (nextStatus === "approved") {
    audit.approvedAt = nowIso;
  }
  if (nextStatus === "declined") {
    audit.declinedAt = nowIso;
  }
  if (nextStatus === "changes_requested") {
    audit.changesRequestedAt = nowIso;
  }

  return audit;
}

function serializeEstimate(row, { includePublicLink = true } = {}) {
  const parsedNotes = parseNotes(row.notes);
  const status = normalizeStatus(row.status);
  const publicLink =
    includePublicLink && isPublicEstimateStatus(status) && row.id
      ? buildPublicEstimateLink(row.id)
      : null;

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
    services: Array.isArray(row.items) ? row.items : [],
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

function buildUpdateRow(body = {}) {
  const nowIso = new Date().toISOString();
  const existingNotes = parseNotes(body.currentNotes || "");
  const previousStatus = normalizeStatus(body.currentStatus);
  const requestedStatus = "status" in body ? normalizeStatus(body.status) : previousStatus;

  const next = {
    updated_at: nowIso,
  };

  if ("clientName" in body) {
    next.client_name = String(body.clientName || "").trim();
  }
  if ("status" in body) {
    next.status = requestedStatus;
  }
  if ("services" in body) {
    next.items = Array.isArray(body.services) ? body.services : [];
  }
  if ("subtotal" in body) {
    next.subtotal = toNumber(body.subtotal);
  }
  if ("tax" in body) {
    next.tax = toNumber(body.tax);
  }
  if ("total" in body) {
    next.total = toNumber(body.total);
  }

  if ("address" in body || "notes" in body || "status" in body) {
    const mergedAudit = withStatusAudit(
      existingNotes.audit,
      previousStatus,
      requestedStatus,
      nowIso,
    );
    next.notes = stringifyNotes({
      address: "address" in body
        ? String(body.address || "").trim()
        : existingNotes.address,
      noteText: "notes" in body
        ? String(body.notes || "")
        : existingNotes.noteText,
      clientEmail: "clientEmail" in body
        ? String(body.clientEmail || "").trim().toLowerCase()
        : existingNotes.clientEmail,
      clientPhone: "clientPhone" in body
        ? String(body.clientPhone || "").trim()
        : existingNotes.clientPhone,
      audit: mergedAudit,
    });
  }

  return next;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) {
      return jsonResponse({ success: false, error: "Invalid estimate id" }, 400);
    }

    let query = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data) {
      return jsonResponse({ success: false, error: "Estimate not found" }, 404);
    }

    return jsonResponse({ success: true, data: serializeEstimate(data) });
  } catch (error) {
    console.error("[api/estimates/:id][GET] error", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function PATCH(request, { params }) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) {
      return jsonResponse({ success: false, error: "Invalid estimate id" }, 400);
    }

    const body = await request.json();

    let existingQuery = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      existingQuery = existingQuery.eq("tenant_id", tenantDbId);
    }

    const { data: existing, error: existingError } = await existingQuery;
    if (existingError) throw new Error(existingError.message);
    if (!existing) {
      return jsonResponse({ success: false, error: "Estimate not found" }, 404);
    }

    // Snapshot the prior shape *before* the update so we can record an
    // accurate revision diff even when the caller patches just one field.
    const beforeSnapshot = serializeEstimate(existing, { includePublicLink: false });

    const toUpdate = buildUpdateRow({
      ...body,
      currentNotes: existing.notes || "",
      currentStatus: existing.status || "draft",
    });

    let updateQuery = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .update(toUpdate)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      updateQuery = updateQuery.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await updateQuery;
    if (error) throw new Error(error.message);
    if (!data) {
      return jsonResponse({ success: false, error: "Estimate not found" }, 404);
    }

    const serialized = serializeEstimate(data);

    // Append revision (best-effort, never blocks the response).
    await recordEstimateRevision({
      estimateId: serialized.id,
      tenantId: serialized.tenantId,
      userId: serialized.userId || null,
      actorLabel: serialized.clientName ? `update: ${serialized.clientName}` : "update",
      before: {
        clientName: beforeSnapshot.clientName,
        clientEmail: beforeSnapshot.clientEmail,
        clientPhone: beforeSnapshot.clientPhone,
        address: beforeSnapshot.address,
        status: beforeSnapshot.status,
        subtotal: beforeSnapshot.subtotal,
        tax: beforeSnapshot.tax,
        total: beforeSnapshot.total,
        notes: beforeSnapshot.notes,
        services: beforeSnapshot.services,
      },
      after: {
        clientName: serialized.clientName,
        clientEmail: serialized.clientEmail,
        clientPhone: serialized.clientPhone,
        address: serialized.address,
        status: serialized.status,
        subtotal: serialized.subtotal,
        tax: serialized.tax,
        total: serialized.total,
        notes: serialized.notes,
        services: serialized.services,
      },
    });

    const nextStatus = normalizeStatus(body?.status, serialized.status);

    const delivery = await deliverEstimateNotifications({
      estimate: serialized,
      sendChannels: body?.sendChannels,
      requestedStatus: nextStatus,
      contextLabel: "api/estimates/:id][PATCH",
    });

    return jsonResponse({ success: true, data: { ...serialized, delivery } });
  } catch (error) {
    console.error("[api/estimates/:id][PATCH] error", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}