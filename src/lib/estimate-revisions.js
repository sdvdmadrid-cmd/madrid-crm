import { supabaseAdmin } from "@/lib/supabase-admin";

const REVISIONS_TABLE = "estimate_revisions";

const ALLOWED_KINDS = new Set([
  "created",
  "updated",
  "sent",
  "resent",
  "approved",
  "declined",
  "changes_requested",
  "duplicated",
  "note",
]);

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function inferKind(statusBefore, statusAfter) {
  const before = String(statusBefore || "").trim().toLowerCase();
  const after = String(statusAfter || "").trim().toLowerCase();
  if (after && before && after !== before) {
    if (after === "sent" && before === "changes_requested") return "resent";
    if (ALLOWED_KINDS.has(after)) return after;
  }
  return "updated";
}

function summarizeChanges(before = {}, after = {}) {
  const diff = {};
  const fields = [
    ["clientName", "clientName"],
    ["clientEmail", "clientEmail"],
    ["clientPhone", "clientPhone"],
    ["address", "address"],
    ["status", "status"],
    ["subtotal", "subtotal"],
    ["tax", "tax"],
    ["total", "total"],
    ["notes", "notes"],
  ];
  for (const [bKey, aKey] of fields) {
    const b = before?.[bKey];
    const a = after?.[aKey];
    if (b === a) continue;
    // Avoid noise from numeric reformatting (1 vs "1.00").
    if (
      typeof b === "number" &&
      typeof a === "number" &&
      Math.abs(b - a) < 0.005
    ) {
      continue;
    }
    diff[aKey] = { before: b ?? null, after: a ?? null };
  }
  // Services array — diff at the count + total level to keep payload small.
  if (Array.isArray(before?.services) || Array.isArray(after?.services)) {
    const beforeCount = Array.isArray(before?.services) ? before.services.length : 0;
    const afterCount = Array.isArray(after?.services) ? after.services.length : 0;
    if (beforeCount !== afterCount) {
      diff.servicesCount = { before: beforeCount, after: afterCount };
    }
  }
  return diff;
}

/**
 * Persist an entry into estimate_revisions. Best-effort, fire-and-
 * forget: never throws, returns nothing. Failures are logged via
 * console.warn so the underlying estimate write stays the source of
 * truth — a missing revision entry never blocks a customer's
 * approval or a contractor's edit.
 *
 * Previously this returned { success, error } objects that NO call
 * site inspected. The mismatch was misleading: it implied the
 * caller should branch on the return, when in practice the caller
 * always discarded it. Returning `void` makes the fire-and-forget
 * contract obvious and removes any temptation to "handle the
 * error" by, e.g., failing the parent request.
 */
export async function recordEstimateRevision({
  estimateId,
  tenantId = null,
  userId = null,
  actorLabel = "",
  kind = null,
  before = {},
  after = {},
  note = "",
}) {
  if (!estimateId) return;

  const resolvedKind = ALLOWED_KINDS.has(String(kind || "").toLowerCase())
    ? String(kind).toLowerCase()
    : inferKind(before?.status, after?.status);

  const changes = summarizeChanges(before, after);

  // Skip pure no-ops on plain "updated" entries to avoid timeline spam.
  if (resolvedKind === "updated" && Object.keys(changes).length === 0 && !note.trim()) {
    return;
  }

  try {
    const { error } = await supabaseAdmin.from(REVISIONS_TABLE).insert({
      estimate_id: estimateId,
      tenant_id: tenantId,
      user_id: userId,
      actor_label: String(actorLabel || "").slice(0, 200),
      kind: resolvedKind,
      status_before: String(before?.status || "").slice(0, 40),
      status_after: String(after?.status || "").slice(0, 40),
      total_before: safeNumber(before?.total),
      total_after: safeNumber(after?.total),
      changes,
      note: String(note || "").slice(0, 2000),
    });
    if (error) {
      console.warn("[estimate-revisions] insert failed", {
        estimateId,
        tenantId,
        error: error.message,
      });
    }
  } catch (err) {
    console.warn("[estimate-revisions] insert exception", {
      estimateId,
      tenantId,
      error: err?.message || String(err),
    });
  }
}

/**
 * List the most recent revisions for an estimate. Caller is responsible for
 * tenant scoping (this helper just enforces it as a query filter).
 */
export async function listEstimateRevisions({ estimateId, tenantId, limit = 50 }) {
  if (!estimateId) return [];
  let query = supabaseAdmin
    .from(REVISIONS_TABLE)
    .select("*")
    .eq("estimate_id", estimateId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(1, Number(limit) || 50), 200));

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[estimate-revisions] list failed", {
      estimateId,
      error: error.message,
    });
    return [];
  }
  return (data || []).map((row) => ({
    id: row.id,
    estimateId: row.estimate_id,
    tenantId: row.tenant_id || null,
    userId: row.user_id || null,
    actorLabel: row.actor_label || "",
    kind: row.kind || "updated",
    statusBefore: row.status_before || "",
    statusAfter: row.status_after || "",
    totalBefore: Number(row.total_before || 0),
    totalAfter: Number(row.total_after || 0),
    changes: row.changes && typeof row.changes === "object" ? row.changes : {},
    note: row.note || "",
    createdAt: row.created_at || null,
  }));
}
