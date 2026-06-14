import {
  ESTIMATE_LOOKUP_LIMIT,
  formatEstimateNumber,
  pickMaxEstimateSequence,
} from "@/lib/estimate-number";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { recordEstimateRevision } from "@/lib/estimate-revisions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  resolveInsertTenant,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { rowHasTenantId } from "@/lib/tenant-row-guard";

const ESTIMATES_TABLE = "estimates";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Allocate the next EST-#### for this tenant. The format helpers live
 * in @/lib/estimate-number so the create / duplicate / estimate-builder
 * routes all share a single canonical formatter; only the DB read
 * lives here. See nextEstimateNumber in /api/estimates/route.js for
 * the full concurrency / ordering rationale.
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

/**
 * Reset the pipeline audit so the duplicate looks like a fresh draft instead
 * of inheriting the source estimate's send/approve/decline history. Notes
 * are kept as JSON if they were JSON (preserving address + client contact),
 * with a cleared audit block.
 */
function buildDuplicatedNotes(sourceNotes) {
  const raw = String(sourceNotes || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.kind === "estimate_pipeline") {
      return JSON.stringify({
        kind: "estimate_pipeline",
        address: String(parsed.address || ""),
        noteText: String(parsed.noteText || ""),
        clientEmail: String(parsed.clientEmail || ""),
        clientPhone: String(parsed.clientPhone || ""),
        audit: {
          sentAt: "",
          approvedAt: "",
          declinedAt: "",
          changesRequestedAt: "",
          resentAt: "",
          resendCount: 0,
        },
      });
    }
  } catch {
    // Legacy plain-text notes — preserve verbatim.
  }
  return raw;
}

/**
 * POST /api/estimates/:id/duplicate
 *
 * Copies the line items, totals, client info, and scope of work from an
 * existing estimate into a brand new "draft" row. Number is regenerated;
 * audit history is cleared. Caller still has to open the duplicate to edit
 * and send it explicitly. Idempotent only at the row level — each call
 * produces a fresh duplicate.
 */
export async function POST(request, { params }) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, userId, role, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) return json({ success: false, error: "Invalid estimate id" }, 400);

    // Read the source within the requester's tenant scope.
    let query = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }
    const { data: source, error: readError } = await query;
    if (readError) throw new Error(readError.message);
    if (!source) return json({ success: false, error: "Estimate not found" }, 404);
    if (!rowHasTenantId(source)) {
      return json({ success: false, error: "Estimate not found" }, 404);
    }

    const nowIso = new Date().toISOString();

    // The duplicate row follows the source estimate's tenant — see
    // resolveInsertTenant in @/lib/tenant for the policy. For regular
    // callers this is identical to the caller's tenant (the source
    // read above already filtered by tenant). For super_admin we
    // explicitly keep the duplicate under the source tenant so the
    // contractor sees it in their pipeline.
    const insertTenantId = resolveInsertTenant({
      sourceTenantId: source.tenant_id,
      callerTenantId: tenantDbId,
    });

    // Insert with retry on the partial unique index added in
    // 20260528200000. Same retry shape used by POST /api/estimates so
    // concurrent duplicates don't collide on the same EST-####.
    let inserted = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const estimateNumber = await nextEstimateNumber(insertTenantId);
      const insert = await supabaseAdmin
        .from(ESTIMATES_TABLE)
        .insert({
          client_name: source.client_name || "",
          status: "draft",
          items: Array.isArray(source.items) ? source.items : [],
          subtotal: source.subtotal || 0,
          tax: source.tax || 0,
          total: source.total || 0,
          notes: buildDuplicatedNotes(source.notes),
          estimate_number: estimateNumber,
          currency: source.currency || "USD",
          tenant_id: insertTenantId,
          user_id: userId || null,
          created_by: userId || null,
          client_id: source.client_id || null,
          job_id: source.job_id || null,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .single();

      if (!insert.error) {
        inserted = insert.data;
        lastError = null;
        break;
      }
      lastError = insert.error;
      const code = String(insert.error.code || "");
      const msg = String(insert.error.message || "");
      const isUniqueViolation = code === "23505" || /duplicate key value/i.test(msg);
      if (!isUniqueViolation) break;
    }

    if (lastError) throw new Error(lastError.message);
    if (!inserted) throw new Error("Failed to allocate a unique estimate number");

    // Log the duplication on the *new* row so the timeline opens with
    // "duplicated from <source>" and the kanban detail panel shows a
    // proper provenance trail. Best-effort.
    await recordEstimateRevision({
      estimateId: inserted.id,
      tenantId: inserted.tenant_id || null,
      userId: userId || null,
      actorLabel: source.estimate_number
        ? `duplicated from ${source.estimate_number}`
        : "duplicated",
      kind: "duplicated",
      before: { status: source.status || "draft", total: Number(source.total || 0) },
      after: { status: inserted.status || "draft", total: Number(inserted.total || 0) },
      note: source.estimate_number
        ? `Cloned from ${source.estimate_number}`
        : "",
    });

    return json({
      success: true,
      data: {
        id: inserted.id,
        estimateNumber: inserted.estimate_number || "",
      },
    });
  } catch (error) {
    console.error("[api/estimates/:id/duplicate] error", error);
    return json({ success: false, error: error.message || "Unable to duplicate estimate" }, 500);
  }
}
