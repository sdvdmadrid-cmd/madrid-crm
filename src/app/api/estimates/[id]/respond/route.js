import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ESTIMATES_TABLE = "estimates";
const QUOTES_TABLE = "quotes";
const ALLOWED_ACTIONS = new Set(["approved", "changes_requested"]);

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

function stringifyNotes({ address = "", noteText = "", clientEmail = "", audit = {} }) {
  return JSON.stringify({
    kind: "estimate_pipeline",
    address, noteText, clientEmail,
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

  const action = String(body.action || "").trim().toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    return json({ success: false, error: "Invalid action. Use 'approved' or 'changes_requested'" }, 400);
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .select("id, tenant_id, user_id, created_by, status, notes, client_name, items, subtotal, tax, total, estimate_number")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) return json({ success: false, error: "Not found" }, 404);

  const currentStatus = String(existing.status || "draft").toLowerCase();
  if (currentStatus === "approved" || currentStatus === "declined") {
    return json({ success: false, error: "This estimate is already finalized." }, 409);
  }

  const nowIso = new Date().toISOString();
  const parsedNotes = parseNotes(existing.notes);
  const audit = { ...parsedNotes.audit };
  if (action === "approved") audit.approvedAt = nowIso;
  if (action === "changes_requested") audit.changesRequestedAt = nowIso;

  const { error: updateErr } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .update({
      status: action,
      notes: stringifyNotes({ ...parsedNotes, audit }),
      updated_at: nowIso,
    })
    .eq("id", id);

  if (updateErr) return json({ success: false, error: updateErr.message }, 500);

  if (action === "approved") {
    const baseNumber = String(existing.estimate_number || "").trim();
    const parsed = parseNotes(existing.notes);
    const lineItems = Array.isArray(existing.items) ? existing.items : [];

    const { data: existingQuote, error: existingQuoteError } = await supabaseAdmin
      .from(QUOTES_TABLE)
      .select("id")
      .eq("tenant_id", String(existing.tenant_id || ""))
      .eq("quote_number", baseNumber)
      .maybeSingle();

    if (existingQuoteError) {
      return json({ success: false, error: existingQuoteError.message }, 500);
    }

    if (!existingQuote) {
      const nowIso = new Date().toISOString();
      const quoteToken = `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;

      const { error: createQuoteError } = await supabaseAdmin
        .from(QUOTES_TABLE)
        .insert({
          tenant_id: String(existing.tenant_id || ""),
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
        return json({ success: false, error: createQuoteError.message }, 500);
      }
    }
  }

  return json({ success: true, status: action });
}
