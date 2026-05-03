import { supabaseAdmin } from "@/lib/supabase-admin";

const ESTIMATES_TABLE = "estimates";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNotes(notes) {
  const raw = String(notes || "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.kind === "estimate_pipeline") {
      return {
        address: String(parsed.address || ""),
        noteText: String(parsed.noteText || ""),
        clientEmail: String(parsed.clientEmail || ""),
        clientPhone: String(parsed.clientPhone || ""),
        audit: {
          sentAt: String(parsed.audit?.sentAt || ""),
          approvedAt: String(parsed.audit?.approvedAt || ""),
          declinedAt: String(parsed.audit?.declinedAt || ""),
          changesRequestedAt: String(parsed.audit?.changesRequestedAt || ""),
        },
      };
    }
  } catch {
    // legacy
  }
  return { address: "", noteText: raw, clientEmail: "", clientPhone: "", audit: {} };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!id) return json({ success: false, error: "Missing id" }, 400);

  const { data, error } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .select("id, client_name, status, items, subtotal, tax, total, notes, estimate_number, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) return json({ success: false, error: "Not found" }, 404);

  const parsedNotes = parseNotes(data.notes);

  return json({
    success: true,
    data: {
      id: data.id,
      estimateNumber: data.estimate_number || "",
      clientName: data.client_name || "",
      clientEmail: parsedNotes.clientEmail || "",
      clientPhone: parsedNotes.clientPhone || "",
      address: parsedNotes.address,
      status: String(data.status || "draft").toLowerCase(),
      services: Array.isArray(data.items) ? data.items : [],
      subtotal: toNumber(data.subtotal),
      tax: toNumber(data.tax),
      total: toNumber(data.total),
      notes: parsedNotes.noteText,
      audit: parsedNotes.audit,
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null,
    },
  });
}
