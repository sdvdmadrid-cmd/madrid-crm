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

function sanitizeSignatureDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("data:image/")) return "";
  if (raw.length > MAX_SIGNATURE_DATA_URL_BYTES) return "";
  return raw;
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

  const clientNote = String(body.note || "").trim();
  const requestedItems = Array.isArray(body.requestedItems) ? body.requestedItems : null;
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
