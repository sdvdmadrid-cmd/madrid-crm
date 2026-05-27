import { supabaseAdmin } from "@/lib/supabase-admin";
import { getEstimateBrandingByTenant } from "@/lib/estimate-email-branding";
import {
  parseEstimateNotes,
  redactAuditForPublic,
} from "@/lib/estimate-notes";
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
  // Record the attempt BEFORE token/access validation. Otherwise an
  // attacker who sprays well-formed-but-invalid tokens never consumes
  // their IP budget (the bucket-check returns allowed, validation fails
  // with 404/403, and the call to recordPublicQuoteAttempt below would
  // be skipped). Recording up front means every attempt counts against
  // the per-IP cap, while well-behaved customers see no change because
  // their valid token always passes validation anyway.
  await recordPublicQuoteAttempt({ token, ip, action: "view" });

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

  const parsedNotes = parseEstimateNotes(data.notes);
  // Strip the customer's signature IP before returning over the public
  // (token-gated) endpoint — the IP only matters in the contractor's
  // audit log.
  const publicAudit = redactAuditForPublic(parsedNotes.audit);
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

  // Paquete E: surface contractor branding so the public estimate view
  // can render the company logo + name in the customer-facing page.
  const branding = await getEstimateBrandingByTenant(data.tenant_id);

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
      audit: publicAudit,
      signatureRequired,
      signatureThreshold,
      signature: publicAudit?.signature || null,
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null,
      branding: {
        companyName: branding.companyName || "",
        logoUrl: branding.logoUrl || "",
        logoPlacement: branding.logoPlacement || "top_left",
      },
    },
  });
}
