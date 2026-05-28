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
import {
  sanitizeClientNote,
  sanitizeRequestedItems,
} from "@/lib/estimate-respond-sanitizers";
import { recordEstimateRevision } from "@/lib/estimate-revisions";
import { runEstimateApprovalHandoff } from "@/lib/estimate-approval-handoff";

const ESTIMATES_TABLE = "estimates";
const ALLOWED_ACTIONS = new Set(["approved", "declined", "changes_requested"]);

// Cap the drawn-signature payload. A 640x180 PNG from the SignaturePad
// canvas typically lives well under 30KB, so 200KB is a generous ceiling
// that still prevents a malicious caller from stuffing megabytes into
// the notes JSON blob (which is stored in a TEXT column).
//
// (The other body-shape caps — MAX_REQUESTED_ITEMS / _ITEM_BYTES /
// _ITEMS_TOTAL_BYTES / MAX_CLIENT_NOTE_CHARS — live in
// @/lib/estimate-respond-sanitizers so the unit tests can import them
// directly. The signature cap stays here because it's coupled to the
// SignaturePad canvas dimensions on the public estimate page.)
const MAX_SIGNATURE_DATA_URL_BYTES = 200 * 1024;

// Defense in depth: restrict accepted signature mime types to raster
// formats the PDF generator actually renders (PNG / JPEG). Previously
// the check was `raw.startsWith("data:image/")`, which would accept
// `data:image/svg+xml;base64,...`. SVG is XML and SVG renderers
// historically have executed inline <script> — the customer-facing
// page renders the signature via <img src=...> (which does NOT
// execute SVG <script>), so this is not an open XSS today, but
// 1) the PDF generator silently drops anything that isn't PNG/JPEG
//    (mime check in estimate-pdf.js's decodeDataUrlImage), creating
//    surprising "the signature disappeared from the PDF" UX, and
// 2) saving SVG into the audit blob may surprise downstream
//    renderers added later (email-attached approvals, slack
//    notifications with rich preview, etc.).
// Anchoring on `^data:image\/(png|jpe?g);base64,` is also what
// SignaturePad emits today (`canvas.toDataURL("image/png")`), so
// legitimate flows are unaffected.
const SIGNATURE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g);base64,/i;

function sanitizeSignatureDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!SIGNATURE_DATA_URL_PATTERN.test(raw)) return "";
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
  // Record the attempt up front (BEFORE any of the downstream
  // validation: action enum check, DB fetch, access verification,
  // status guard, signature policy). Otherwise an attacker who sprays
  // well-formed tokens but invalid actions / wrong-target IDs never
  // consumes their per-IP "approval" budget — the bucket-check passes
  // (count below cap), the request fails 400/404/403 downstream, and
  // the original record-on-success call below is skipped. Recording
  // up front means every reach into this endpoint counts against the
  // 15/IP per 10-min mutation cap, regardless of outcome. Legitimate
  // customers are unaffected because their happy-path approval always
  // passes validation anyway.
  await recordPublicQuoteAttempt({ token, ip, action: "approval" });

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

  // Optimistic concurrency guard: only update the row if
  // updated_at still matches what we read into `existing` above.
  // Prevents the customer's approval from clobbering a concurrent
  // contractor edit (and vice versa). Without this, the following
  // race silently corrupted state:
  //   t0  contractor PATCH reads estimate (snapshot S)
  //   t1  customer hits respond, writes approved + signature
  //   t2  contractor PATCH writes using S (signature now lost,
  //       status reverted)
  //
  // The DB write below selects to detect the no-rows-matched case
  // explicitly so we can return a 409 with a clear message rather
  // than a generic 500.
  const previousUpdatedAt = existing.updated_at;
  const { data: updateData, error: updateErr } = await supabaseAdmin
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
    .eq("id", id)
    .eq("updated_at", previousUpdatedAt)
    .select("id")
    .maybeSingle();

  if (updateErr) return json({ success: false, error: updateErr.message }, 500);

  if (!updateData) {
    // No row matched both (id, updated_at). The estimate exists
    // (we already proved that earlier) but updated_at moved while
    // we were computing — concurrent modification. The customer-
    // facing page surfaces this error to the user, who should
    // refresh and try again.
    return json(
      {
        success: false,
        error:
          "This estimate was just updated by the contractor. Please refresh the page and try again.",
        conflict: true,
      },
      409,
    );
  }

  // (recordPublicQuoteAttempt already ran near the top of this handler,
  // so the attacker who sprays invalid actions also drains their bucket;
  // we don't double-count the happy path here.)

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
      await runEstimateApprovalHandoff({ estimate: existing, nowIso });
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
