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

const ESTIMATES_TABLE = "estimates";
const QUOTES_TABLE = "quotes";
const ALLOWED_ACTIONS = new Set(["approved", "declined", "changes_requested"]);

function parseNotes(notes) {
  const raw = String(notes || "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.kind === "estimate_pipeline") {
      return {
        address: String(parsed.address || ""),
        noteText: String(parsed.noteText || ""),
        clientEmail: String(parsed.clientEmail || ""),
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
    // legacy
  }
  return {
    address: "", noteText: raw, clientEmail: "",
    audit: { sentAt: "", approvedAt: "", declinedAt: "", changesRequestedAt: "", resentAt: "", resendCount: 0 },
  };
}

function stringifyNotes({ address = "", noteText = "", clientEmail = "", clientPhone = "", requestedItems = null, audit = {} }) {
  return JSON.stringify({
    kind: "estimate_pipeline",
    address, noteText, clientEmail, clientPhone,
    ...(requestedItems !== null ? { requestedItems } : {}),
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
  const parsedNotes = parseNotes(existing.notes);
  const audit = { ...parsedNotes.audit };
  if (action === "approved") audit.approvedAt = nowIso;
  if (action === "declined") audit.declinedAt = nowIso;
  if (action === "changes_requested") audit.changesRequestedAt = nowIso;

  const clientNote = String(body.note || "").trim();
  const requestedItems = Array.isArray(body.requestedItems) ? body.requestedItems : null;
  const updatedNoteText = clientNote
    ? (parsedNotes.noteText ? `${parsedNotes.noteText}\n\nClient note: ${clientNote}` : `Client note: ${clientNote}`)
    : parsedNotes.noteText;

  const { error: updateErr } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .update({
      status: action,
      notes: stringifyNotes({
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
  const parsed = parseNotes(existing.notes);
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
      client_id: "",
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
