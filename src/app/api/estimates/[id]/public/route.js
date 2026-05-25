import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  checkPublicQuoteRateLimit,
  getRequestIp,
  recordPublicQuoteAttempt,
} from "@/lib/rate-limit";
import {
  isValidEstimatePublicToken,
  verifyEstimatePublicAccess,
} from "@/lib/estimate-public-access";
import { isSignatureRequiredForEstimate } from "@/lib/estimate-signature-policy";

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
      const signature =
        parsed.audit?.signature && typeof parsed.audit.signature === "object"
          ? {
              name: String(parsed.audit.signature.name || ""),
              signedAt: String(parsed.audit.signature.signedAt || ""),
            }
          : null;
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
          signature,
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

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id) return json({ success: false, error: "Missing id" }, 400);

  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!isValidEstimatePublicToken(token)) {
    return json({ success: false, error: "Invalid or missing access token" }, 403);
  }

  const ip = getRequestIp(request);
  const rate = await checkPublicQuoteRateLimit({ token, ip, action: "view" });
  if (!rate.allowed) {
    return json({ success: false, error: "Too many requests. Please try again later." }, 429);
  }

  const { data, error } = await supabaseAdmin
    .from(ESTIMATES_TABLE)
    .select(
      "id, tenant_id, client_name, status, items, subtotal, tax, total, notes, estimate_number, created_at, updated_at",
    )
    .eq("id", id)
    .single();

  if (error || !data) return json({ success: false, error: "Not found" }, 404);

  const access = verifyEstimatePublicAccess(data, token);
  if (!access.ok) {
    return json({ success: false, error: access.error }, access.status);
  }

  await recordPublicQuoteAttempt({ token, ip, action: "view" });

  const parsedNotes = parseNotes(data.notes);
  const total = toNumber(data.total);

  // Paquete I: surface whether this estimate needs a typed signature
  // before the customer can approve it. Falls back to no-policy (open
  // approve) on any error so the customer never sees a blocked flow
  // because of an infrastructure issue.
  const { required: signatureRequired, threshold: signatureThreshold } =
    await isSignatureRequiredForEstimate({
      tenantId: data.tenant_id,
      total,
    });

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
      total,
      notes: parsedNotes.noteText,
      audit: parsedNotes.audit,
      signatureRequired,
      signatureThreshold,
      signature: parsedNotes.audit?.signature || null,
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null,
    },
  });
}
