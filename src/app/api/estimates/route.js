import {
  attachFreshPartyToEstimateDbRow,
  enrichEstimateWithPartyInfo,
  enrichEstimatesWithPartyBatch,
} from "@/lib/client-document-party";
import {
  buildPublicEstimateLink,
  isPublicEstimateStatus,
} from "@/lib/estimate-public-access";
import { deriveServiceTitleFromScope } from "@/lib/estimate-pdf-content";
import {
  buildAuditForCreate,
  parseEstimateNotes,
  stringifyEstimateNotes,
} from "@/lib/estimate-notes";
import {
  ESTIMATE_LOOKUP_LIMIT,
  formatEstimateNumber,
  pickMaxEstimateSequence,
} from "@/lib/estimate-number";
import { deliverEstimateNotifications } from "@/lib/estimate-notifications";
import {
  serializeEstimateBase,
  toNumber,
} from "@/lib/estimate-serializer";
import { recordEstimateRevision } from "@/lib/estimate-revisions";
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

/**
 * Contractor-facing serializer. Delegates the canonical shape to
 * serializeEstimateBase (shared with /api/estimates/[id] and the
 * PDF / public routes) and layers on `publicLink` — which only the
 * authenticated list/read surfaces need.
 */
function serializeEstimate(row) {
  const base = serializeEstimateBase(row);
  const publicLink =
    isPublicEstimateStatus(base.status) && base.id
      ? buildPublicEstimateLink(base.id)
      : null;
  return { ...base, publicLink };
}

/**
 * Recompute the line-item subtotal from a services array. Mirrors the
 * client-side math in `/estimates/new` and the public PDF builder so the
 * server has a single source of truth instead of trusting client totals.
 *
 * Each service row is expected to provide one of:
 *   - `price` (a final line total)
 *   - `unitPrice * qty` (the row was just typed in)
 * Rounded to cents using bankers-safe arithmetic.
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

function buildEstimateRow(body = {}, nowIso) {
  const services = Array.isArray(body.services) ? body.services : [];
  // Recompute subtotal from line items so a tampered or stale client
  // payload can't silently desync totals. The provided subtotal is kept
  // only if the line items can't be summed (empty array, etc).
  const computedSubtotal = recomputeSubtotal(services);
  const subtotal =
    services.length === 0 && body.subtotal !== undefined
      ? toNumber(body.subtotal)
      : Math.round(computedSubtotal * 100) / 100;
  const tax = Math.max(0, Math.round(toNumber(body.tax) * 100) / 100);
  const total = Math.round((subtotal + tax) * 100) / 100;
  const normalizedStatus = normalizeStatus(body.status);
  return {
    client_name: String(body.clientName || "").trim(),
    status: normalizedStatus,
    items: services,
    subtotal,
    tax,
    total,
    notes: stringifyEstimateNotes({
      address: String(body.address || "").trim(),
      noteText: String(body.notes || ""),
      serviceTitle: deriveServiceTitleFromScope(
        String(body.notes || ""),
        body.serviceTitle,
      ),
      clientUuid: String(body.clientUuid || body.clientId || "").trim(),
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
 * Generate the next EST-#### identifier for this tenant. The format
 * helpers (uppercase prefix, padStart-as-floor) live in
 * @/lib/estimate-number so they stay in lockstep with the other two
 * estimate-creation routes (duplicate, estimate-builder) and so the
 * unit tests can import them directly. Only the DB read is here.
 *
 * Concurrency: the unique index on (tenant_id, estimate_number) from
 * 20260528200000_estimate_number_uniqueness.sql guards against
 * collisions; the call-site below retries on 23505 with a fresh
 * number a few times before giving up.
 *
 * Why limit() instead of `order(estimate_number desc) limit 1`: lex
 * order breaks at the 9999 -> 10000 boundary, so we order by
 * `created_at desc` and pick the max numeric suffix ourselves via
 * pickMaxEstimateSequence.
 */
async function nextEstimateNumber(tenantId) {
  const { data, error } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .select("estimate_number, created_at")
    .eq("tenant_id", tenantId)
    .ilike("estimate_number", "EST-%")
    .order("created_at", { ascending: false })
    .limit(ESTIMATE_LOOKUP_LIMIT);
  if (error) throw new Error(error.message);
  return formatEstimateNumber(pickMaxEstimateSequence(data) + 1);
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
      .order("created_at", { ascending: false })
      .limit(250);

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const serialized = await enrichEstimatesWithPartyBatch(
      supabaseAdmin,
      tenantDbId,
      (data || []).map(serializeEstimate),
    );

    return jsonResponse({
      success: true,
      data: serialized,
    });
  } catch (error) {
    console.error("[api/estimates][GET] error", {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  // Hoist diagnostic ids so the catch block can include them.
  let logTenantId = null;
  let logUserId = null;

  try {
    const { tenantDbId, userId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();
    logTenantId = tenantDbId || null;
    logUserId = userId || null;

    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.body;
    const nowIso = new Date().toISOString();
    const mapped = buildEstimateRow(body, nowIso);
    if (!mapped.client_name) {
      return jsonResponse({ success: false, error: "Client name is required" }, 400);
    }

    const mappedWithParty = await attachFreshPartyToEstimateDbRow(
      supabaseAdmin,
      tenantDbId,
      mapped,
    );

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
          ...mappedWithParty,
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

    // Record the creation in the revisions log so the detail panel has a
    // real "created" entry. Best-effort — never blocks the response.
    await recordEstimateRevision({
      estimateId: serialized.id,
      tenantId: serialized.tenantId,
      userId: serialized.userId || null,
      actorLabel: serialized.clientName ? `created for ${serialized.clientName}` : "created",
      kind: "created",
      before: {},
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

    const delivery = await deliverEstimateNotifications({
      estimate: serialized,
      sendChannels: body?.sendChannels,
      requestedStatus: serialized.status,
      contextLabel: "api/estimates][POST",
    });

    return jsonResponse({ success: true, data: { ...serialized, delivery } });
  } catch (error) {
    console.error("[api/estimates][POST] error", {
      tenantId: logTenantId,
      userId: logUserId,
      error: error?.message || String(error),
      stack: error?.stack,
    });
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}