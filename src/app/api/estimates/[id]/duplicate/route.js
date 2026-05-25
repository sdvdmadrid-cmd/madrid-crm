import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ESTIMATES_TABLE = "estimates";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Pick the next EST-#### identifier for a tenant by inspecting the highest
 * existing suffix. Mirrors the helper in /api/estimates so the duplicate
 * flow stays consistent with the create flow.
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
    const { tenantDbId, userId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
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

    const nowIso = new Date().toISOString();

    // Insert with retry on the partial unique index added in
    // 20260528200000. Same retry shape used by POST /api/estimates so
    // concurrent duplicates don't collide on the same EST-####.
    let inserted = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const estimateNumber = await nextEstimateNumber(source.tenant_id);
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
          tenant_id: source.tenant_id,
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
