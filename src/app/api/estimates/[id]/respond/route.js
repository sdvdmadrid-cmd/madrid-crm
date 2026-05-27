import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  checkPublicQuoteRateLimit,
  getRequestIp,
  recordPublicQuoteAttempt,
} from "@/lib/rate-limit";
import {
  canRespondToEstimateStatus,
  isValidEstimatePublicToken,
  normalizeEstimateStatus,
  verifyEstimatePublicAccess,
} from "@/lib/estimate-public-access";
import {
  isSignatureRequiredForEstimate,
  sanitizeSignatureName,
} from "@/lib/estimate-signature-policy";
import {
  buildAuditForStatusTransition,
  parseEstimateNotes,
  stringifyEstimateNotes,
} from "@/lib/estimate-notes";
import { recordEstimateRevision } from "@/lib/estimate-revisions";

const ESTIMATES_TABLE = "estimates";
const QUOTES_TABLE = "quotes";
const ALLOWED_ACTIONS = new Set(["approved", "declined", "changes_requested"]);

// Cap the drawn-signature payload. A 640x180 PNG from the SignaturePad
// canvas typically lives well under 30KB, so 200KB is a generous ceiling
// that still prevents a malicious caller from stuffing megabytes into
// the notes JSON blob (which is stored in a TEXT column).
const MAX_SIGNATURE_DATA_URL_BYTES = 200 * 1024;

// Defensive caps for the customer-supplied payload. The "notes" column is
// TEXT (no DB-side length enforcement), and the contractor reads every
// requested item back when rendering the timeline / change-request UI,
// so an unbounded array lets a malicious caller (a) bloat the DB row,
// (b) push the JSON-encoded notes past the 1MB Supabase row-size soft
// limit, and (c) slow every subsequent estimate read for that record.
//
// Caps:
//   - At most 50 requested items per submission (a real estimate with
//     more line items than this is almost certainly malformed).
//   - At most 4KB per individual item after JSON-serialization (a
//     reasonable line-item description with a few flags fits easily).
//   - At most 64KB total across all items (so 50 max-size items would
//     overflow this cap and be truncated — the cap is the hard limit).
//   - At most 5KB for the free-form client note (the revision log
//     already truncates to 1000 chars for the timeline; this guards
//     the appended-to noteText field that lives in the notes blob).
const MAX_REQUESTED_ITEMS = 50;
const MAX_REQUESTED_ITEM_BYTES = 4 * 1024;
const MAX_REQUESTED_ITEMS_TOTAL_BYTES = 64 * 1024;
const MAX_CLIENT_NOTE_CHARS = 5 * 1024;

function sanitizeSignatureDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("data:image/")) return "";
  if (raw.length > MAX_SIGNATURE_DATA_URL_BYTES) return "";
  return raw;
}

/**
 * Sanitize a client-supplied `requestedItems` array. Returns `null` if
 * the input is not an array (matching the previous behavior — callers
 * downstream branch on null vs array), otherwise returns a filtered
 * array that respects per-item and total size caps.
 *
 * Sanitization rules (each applied in order):
 *   1. Truncate to MAX_REQUESTED_ITEMS entries.
 *   2. Drop entries that cannot be JSON-serialized (circular refs,
 *      symbols, etc.).
 *   3. Drop entries whose serialized length exceeds
 *      MAX_REQUESTED_ITEM_BYTES (a single huge item).
 *   4. Stop accepting further entries once the running total reaches
 *      MAX_REQUESTED_ITEMS_TOTAL_BYTES (cumulative cap).
 *
 * Returns `null` if every entry was rejected (so the downstream
 * stringifyEstimateNotes can leave the field unset rather than persist
 * an empty array, matching the legacy "no items" shape).
 */
function sanitizeRequestedItems(value) {
  if (!Array.isArray(value)) return null;
  const limitedByCount = value.slice(0, MAX_REQUESTED_ITEMS);
  const accepted = [];
  let totalBytes = 0;
  for (const item of limitedByCount) {
    let serialized;
    try {
      serialized = JSON.stringify(item);
    } catch {
      continue;
    }
    if (typeof serialized !== "string") continue;
    if (serialized.length === 0) continue;
    if (serialized.length > MAX_REQUESTED_ITEM_BYTES) continue;
    if (totalBytes + serialized.length > MAX_REQUESTED_ITEMS_TOTAL_BYTES) break;
    totalBytes += serialized.length;
    accepted.push(item);
  }
  return accepted.length > 0 ? accepted : null;
}

/**
 * Cap free-form client notes before they get concatenated into the
 * stored noteText field. The revision-log path already independently
 * truncates to 1000 chars for the timeline display.
 */
function sanitizeClientNote(value) {
  const raw = String(value || "");
  // Trim AFTER slicing so an attacker can't pad with whitespace to
  // push real content past the cap.
  return raw.slice(0, MAX_CLIENT_NOTE_CHARS).trim();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request, { params }) {
  const { id } = await params;
  if (!id) return json({ success: false, error: "Missing id" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }

  const token = String(body.token || "").trim();
  if (!isValidEstimatePublicToken(token)) {
    return json({ success: false, error: "Invalid or missing access token" }, 403);
  }

  const ip = getRequestIp(request);
  const rate = await checkPublicQuoteRateLimit({ token, ip, action: "approval" });
  if (!rate.allowed) {
    return json({ success: false, error: "Too many requests. Please try again later." }, 429);
  }

  const action = String(body.action || "").trim().toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    return json({ success: false, error: "Invalid action. Use 'approved', 'declined', or 'changes_requested'" }, 400);
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .select("id, tenant_id, user_id, created_by, status, notes, client_name, items, subtotal, tax, total, estimate_number")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) return json({ success: false, error: "Not found" }, 404);

  const access = verifyEstimatePublicAccess(existing, token);
  if (!access.ok) {
    return json({ success: false, error: access.error }, access.status);
  }

  const currentStatus = normalizeEstimateStatus(existing.status);
  if (!canRespondToEstimateStatus(currentStatus)) {
    return json({ success: false, error: "This estimate is already finalized." }, 409);
  }

  const nowIso = new Date().toISOString();
  const parsedNotes = parseEstimateNotes(existing.notes);
  // Use the shared status-transition helper so the contractor PATCH path
  // (/api/estimates/[id]) and this customer respond path stamp audit
  // timestamps through the same source of truth. Any future tweaks to
  // the audit shape (resendCount semantics, signature carry-forward,
  // field normalization) then automatically apply to both surfaces and
  // can't drift between them.
  const audit = buildAuditForStatusTransition(
    parsedNotes.audit,
    currentStatus,
    action,
    nowIso,
  );

  // Paquete I: require a typed signature on approvals once the estimate
  // exceeds the tenant's configured threshold. If the customer never sent
  // a name (or sent an obviously malformed one), reject with a clear 400
  // so the public page can prompt for it. Other actions (decline /
  // changes_requested) are unaffected.
  if (action === "approved") {
    const { required: signatureRequired, threshold } =
      await isSignatureRequiredForEstimate({
        tenantId: existing.tenant_id,
        total: existing.total,
      });

    if (signatureRequired) {
      const signatureName = sanitizeSignatureName(body.signatureName);
      const agreed = body.signatureAgreement === true;

      if (!signatureName || !agreed) {
        return json(
          {
            success: false,
            error: "A typed signature is required to approve this estimate.",
            signatureRequired: true,
            signatureThreshold: threshold,
          },
          400,
        );
      }

      // Optional drawn signature attached on top of the typed name. The
      // typed name remains the canonical identifier; the drawing is
      // supplementary evidence for jurisdictions / contractors that want
      // a hand-signed visual. Reject anything that isn't a small inline
      // image data URL so we never persist a remote URL or an oversized
      // payload that would balloon the notes blob.
      const drawn = sanitizeSignatureDataUrl(body.signatureDrawDataUrl);

      audit.signature = {
        name: signatureName,
        signedAt: nowIso,
        ip: String(ip || ""),
        method: drawn ? "drawn_and_typed" : "typed",
        ...(drawn ? { dataUrl: drawn } : {}),
      };
    }
  }

  const clientNote = sanitizeClientNote(body.note);
  const requestedItems = sanitizeRequestedItems(body.requestedItems);
  const updatedNoteText = clientNote
    ? (parsedNotes.noteText ? `${parsedNotes.noteText}\n\nClient note: ${clientNote}` : `Client note: ${clientNote}`)
    : parsedNotes.noteText;

  const { error: updateErr } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .update({
      status: action,
      notes: stringifyEstimateNotes({
        ...parsedNotes,
        noteText: updatedNoteText,
        requestedItems,
        audit,
      }),
      updated_at: nowIso,
    })
    .eq("id", id);

  if (updateErr) return json({ success: false, error: updateErr.message }, 500);

  await recordPublicQuoteAttempt({ token, ip, action: "approval" });

  // Append a revision so the contractor's timeline reflects what the
  // customer just did. Best-effort — failures don't break the response.
  // The actor is the customer (no internal user id), so we mark the
  // action label with their name when known and leave user_id null.
  const revisionKind =
    action === "approved"
      ? "approved"
      : action === "declined"
        ? "declined"
        : "changes_requested";
  const customerLabel = existing.client_name
    ? `client (${existing.client_name})`
    : "client";
  await recordEstimateRevision({
    estimateId: existing.id,
    tenantId: existing.tenant_id || null,
    userId: null,
    actorLabel: customerLabel,
    kind: revisionKind,
    before: { status: currentStatus, total: Number(existing.total || 0) },
    after: { status: action, total: Number(existing.total || 0) },
    note: clientNote ? `Client note: ${clientNote.slice(0, 1000)}` : "",
  });

  // From this point the estimate status has already been written successfully.
  // The follow-up quote auto-creation is a convenience handoff — if it fails
  // we still tell the customer their approval was accepted (it was) and log
  // the issue so the contractor can repair the quote linkage out-of-band.
  // Previously a quote insert error returned 500 even though the estimate was
  // already approved, leaving the system in a state where the customer
  // believed approval failed and the contractor's dashboard showed approved.
  if (action === "approved") {
    try {
      await ensureQuoteForApprovedEstimate({ existing, nowIso });
    } catch (quoteError) {
      console.error(
        "[api/estimates/:id/respond] quote auto-create failed (estimate already approved)",
        {
          estimateId: existing.id,
          tenantId: existing.tenant_id,
          estimateNumber: existing.estimate_number,
          error: quoteError?.message || String(quoteError),
        },
      );
      return json({
        success: true,
        status: action,
        warning: "Approval recorded. The contractor will follow up to send a signable quote.",
      });
    }
  }

  return json({ success: true, status: action });
}

/**
 * Idempotently materialize a quote row for an approved estimate. Throws on
 * failure so the caller can decide how to surface the error to the customer.
 */
async function ensureQuoteForApprovedEstimate({ existing, nowIso }) {
  const tenantId = String(existing.tenant_id || "").trim();
  if (!tenantId) {
    // No tenant_id means we cannot scope the quote to a contractor account.
    // Skip without throwing — the estimate is still approved and surfaced
    // under the estimate list. Adding an orphan quote row would just create
    // junk data.
    console.warn(
      "[api/estimates/:id/respond] skipping quote creation: estimate has no tenant_id",
      { estimateId: existing.id },
    );
    return;
  }

  const baseNumber = String(existing.estimate_number || "").trim();
  const parsed = parseEstimateNotes(existing.notes);
  const lineItems = Array.isArray(existing.items) ? existing.items : [];

  const { data: existingQuote, error: existingQuoteError } = await supabaseAdmin
    .from(QUOTES_TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("quote_number", baseNumber)
    .maybeSingle();

  if (existingQuoteError) {
    throw new Error(existingQuoteError.message);
  }
  if (existingQuote) return;

  const quoteToken = `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;

  const { error: createQuoteError } = await supabaseAdmin
    .from(QUOTES_TABLE)
    .insert({
      tenant_id: tenantId,
      user_id: existing.user_id || null,
      created_by: existing.created_by || null,
      quote_number: baseNumber || String(Date.now()),
      title: `Quote for ${existing.client_name || "Client"}`,
      // Previously persisted as an empty string, which fails UUID-typed
      // FK checks on `quotes.client_id`. Null is the canonical "unset".
      client_id: existing.client_id || null,
      client_name: existing.client_name || "",
      client_email: parsed.clientEmail || "",
      client_phone: parsed.clientPhone || "",
      address_line1: parsed.address || "",
      address_line2: "",
      city: "",
      state: "",
      zip: "",
      property_address: parsed.address || "",
      line_items: lineItems,
      scope_of_work: parsed.noteText || "",
      status: "approved",
      quote_token: quoteToken,
      quote_shared_at: nowIso,
      sent_at: nowIso,
      approved_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

  if (createQuoteError) {
    throw new Error(createQuoteError.message);
  }
}
