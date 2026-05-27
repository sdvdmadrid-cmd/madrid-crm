import {
  buildPublicEstimateLink,
  isPublicEstimateStatus,
} from "@/lib/estimate-public-access";
import {
  buildAuditForStatusTransition,
  parseEstimateNotes,
  stringifyEstimateNotes,
} from "@/lib/estimate-notes";
import { deliverEstimateNotifications } from "@/lib/estimate-notifications";
import { recordEstimateRevision } from "@/lib/estimate-revisions";
import {
  serializeEstimateBase,
  toNumber,
} from "@/lib/estimate-serializer";
import { parseJsonBody } from "@/lib/parse-json-body";
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

function serializeEstimate(row, { includePublicLink = true } = {}) {
  const base = serializeEstimateBase(row);
  const publicLink =
    includePublicLink && isPublicEstimateStatus(base.status) && base.id
      ? buildPublicEstimateLink(base.id)
      : null;
  return { ...base, publicLink };
}

/**
 * Recompute subtotal from a services array — mirrors the create route. Keeps
 * server-side numbers consistent with line items regardless of what the
 * client sent in the body.
 */
function recomputeSubtotal(services) {
  if (!Array.isArray(services)) return 0;
  let cents = 0;
  for (const service of services) {
    const qty = Number.isFinite(Number(service?.qty)) ? Number(service.qty) : 1;
    const unit = Number.isFinite(Number(service?.unitPrice ?? service?.price))
      ? Number(service?.unitPrice ?? service?.price)
      : 0;
    const explicit = service?.price !== undefined ? Number(service.price) : NaN;
    const lineTotal = Number.isFinite(explicit) ? explicit : unit * qty;
    if (!Number.isFinite(lineTotal)) continue;
    cents += Math.round(lineTotal * 100);
  }
  return cents / 100;
}

function buildUpdateRow(body = {}) {
  const nowIso = new Date().toISOString();
  const existingNotes = parseEstimateNotes(body.currentNotes || "");
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

  // When services are touched, recompute subtotal/tax/total from the items
  // and the supplied tax so totals stay consistent even if the client sent
  // a stale or tampered value. When only totals are patched (e.g. a tax
  // adjustment without items), we accept the provided numbers verbatim.
  const servicesProvided = "services" in body;
  if (servicesProvided) {
    const services = Array.isArray(body.services) ? body.services : [];
    next.items = services;
    const computedSubtotal = Math.round(recomputeSubtotal(services) * 100) / 100;
    next.subtotal = computedSubtotal;
    const providedTax = "tax" in body ? Math.max(0, toNumber(body.tax)) : 0;
    next.tax = Math.round(providedTax * 100) / 100;
    next.total = Math.round((next.subtotal + next.tax) * 100) / 100;
  } else {
    if ("subtotal" in body) {
      next.subtotal = Math.round(toNumber(body.subtotal) * 100) / 100;
    }
    if ("tax" in body) {
      next.tax = Math.max(0, Math.round(toNumber(body.tax) * 100) / 100);
    }
    if ("total" in body) {
      next.total = Math.round(toNumber(body.total) * 100) / 100;
    }
  }

  if ("address" in body || "notes" in body || "status" in body) {
    const mergedAudit = buildAuditForStatusTransition(
      existingNotes.audit,
      previousStatus,
      requestedStatus,
      nowIso,
    );
    // Carry forward requestedItems by default. The previous version of
    // this helper omitted the field entirely from the rewrite, which
    // silently wiped any change-request payload the customer had
    // submitted via /api/estimates/[id]/respond — the contractor would
    // open the estimate to edit it and the change-request list would
    // disappear. The customer surface only adds items via respond, so
    // the contractor PATCH must either pass them through unchanged or
    // explicitly clear them by setting body.requestedItems to null/[].
    let nextRequestedItems = existingNotes.requestedItems || null;
    if ("requestedItems" in body) {
      nextRequestedItems = Array.isArray(body.requestedItems)
        ? body.requestedItems
        : null;
    }
    next.notes = stringifyEstimateNotes({
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
      requestedItems: nextRequestedItems,
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
    console.error("[api/estimates/:id][GET] error", {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function PATCH(request, { params }) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  // Hoist a few diagnostic ids out of the try block so the catch
  // branch's structured log can include them even when the error
  // happens after we've established the context but before we
  // return. Filled inside the try when the values become available;
  // remain null if the error fires earlier (e.g. context fetch
  // failure).
  let logEstimateId = null;
  let logTenantId = null;
  let logUserId = null;

  try {
    const { tenantDbId, userId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();
    logTenantId = tenantDbId || null;
    logUserId = userId || null;

    const { id } = await params;
    if (!id) {
      return jsonResponse({ success: false, error: "Invalid estimate id" }, 400);
    }
    logEstimateId = id;

    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;

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

    // Optimistic concurrency: only update if updated_at still
    // matches what we read into `existing` a few lines up. Prevents
    // two contractors (or a contractor + the customer's public
    // respond endpoint) from clobbering each other silently.
    //
    // The previous shape used `.eq("id", id)` alone with `.select`
    // returning the row, so an update that wrote the same row from
    // a stale snapshot would succeed without surfacing any signal.
    // The race documented in F2 of the hardening audit (contractor
    // edits overwriting a customer's just-recorded signature) was
    // a concrete instance of this.
    //
    // If the (id, updated_at) selector matches zero rows, the row
    // either was just updated by someone else (409 conflict) or
    // was deleted in the interim. We return 409 in both cases — a
    // 404 path is reserved for the initial read above; by the time
    // we are here we know the row exists at-or-after that read.
    const previousUpdatedAt = existing.updated_at;
    let updateQuery = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .update(toUpdate)
      .eq("id", id)
      .eq("updated_at", previousUpdatedAt)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      updateQuery = updateQuery.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await updateQuery;
    if (error) throw new Error(error.message);
    if (!data) {
      return jsonResponse(
        {
          success: false,
          error:
            "This estimate was modified by another user. Please reload and try again.",
          conflict: true,
        },
        409,
      );
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
    // Structured log line so production traces capture enough context
    // to repro / triage. Previously: `[api/estimates/:id][PATCH] error
    // <Error>` with no id, tenant, or user — correlating with surrounding
    // requests required walking the timestamp.
    console.error("[api/estimates/:id][PATCH] error", {
      estimateId: logEstimateId,
      tenantId: logTenantId,
      userId: logUserId,
      error: error?.message || String(error),
      stack: error?.stack,
    });
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}