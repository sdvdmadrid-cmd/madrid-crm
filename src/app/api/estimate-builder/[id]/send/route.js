import { sendEmail } from "@/lib/email";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canSendExternal,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

// Tabla relacional: estimate_builder

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

/**
 * HTML-escape a string before interpolating into an email template. This
 * email is built by hand (no template engine), so any tenant-controlled
 * field — name, description, line item names, notes — needs explicit
 * escaping or a client typing `<script>` into a service name would inject
 * markup into the recipient's mailbox.
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEstimateEmail(estimate) {
  const name = estimate.name || "Estimate";
  const lines = Array.isArray(estimate.lines) ? estimate.lines : [];
  // The DB row stores totals as snake_case (`total_final` / `total_mid`).
  // The previous implementation read `estimate.totalFinal || estimate.totalMid`
  // which always fell through to 0 and produced an undercount in the email.
  const totalNumber = Number(
    estimate.total_final ??
      estimate.totalFinal ??
      estimate.total_mid ??
      estimate.totalMid ??
      0,
  );
  const total = (Number.isFinite(totalNumber) ? totalNumber : 0).toFixed(2);

  const lineRows = lines
    .map((l) => {
      const qty = Number(l.qty) || 1;
      const unit = Number(l.finalPrice || 0);
      const lineTotal = (qty * unit).toFixed(2);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${escapeHtml(l.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">$${unit.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">$${lineTotal}</td>
      </tr>`;
    })
    .join("");

  const lineText = lines
    .map((l) => {
      const qty = Number(l.qty) || 1;
      const unit = Number(l.finalPrice || 0);
      return `  ${l.name} x${qty} @ $${unit.toFixed(2)} = $${(qty * unit).toFixed(2)}`;
    })
    .join("\n");

  const subject = `Estimate: ${name}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
      <h2 style="margin:0 0 8px 0;font-size:22px;">${escapeHtml(name)}</h2>
      ${estimate.description ? `<p style="color:#555;margin:0 0 20px 0;">${escapeHtml(estimate.description)}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th style="padding:8px 12px;text-align:left;font-size:13px;">Service</th>
            <th style="padding:8px 12px;text-align:right;font-size:13px;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:13px;">Unit price</th>
            <th style="padding:8px 12px;text-align:right;font-size:13px;">Total</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>
      <div style="padding:14px 18px;background:#0b69ff;border-radius:10px;color:#fff;display:inline-block;">
        <span style="font-size:13px;opacity:0.85;">Total</span>
        <div style="font-size:24px;font-weight:700;">$${total}</div>
      </div>
      ${estimate.notes ? `<p style="margin-top:20px;color:#555;font-size:14px;"><em>Notes: ${escapeHtml(estimate.notes)}</em></p>` : ""}
    </div>
  `;

  const text = [
    name,
    "",
    ...lines.map((l) => `  ${l.name} x${Number(l.qty) || 1}`),
    lineText,
    "",
    `Total: $${total}`,
    ...(estimate.notes ? ["", `Notes: ${estimate.notes}`] : []),
  ].join("\n");

  return { subject, html, text };
}

export async function POST(request, { params }) {
  try {
    const csrf = enforceSameOriginForMutation(request);
    if (csrf) return csrf;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canSendExternal(role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid estimate id" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();
    const { method, to } = body;

    if (method !== "email") {
      return new Response(
        JSON.stringify({ success: false, error: "Unsupported send method" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!isValidEmail(to)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email address" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let query = supabaseAdmin.from("estimate_builder").select("*").eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data: estimate, error: estimateError } = await query.maybeSingle();
    if (estimateError) {
      console.error(
        "[api/estimate-builder/:id/send] Supabase estimate query error",
        estimateError,
      );
      throw new Error(estimateError.message);
    }

    if (!estimate) {
      return new Response(
        JSON.stringify({ success: false, error: "Estimate not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const { subject, html, text } = buildEstimateEmail(estimate);

    const sendResult = await sendEmail({
      to,
      subject,
      html,
      text,
      metadata: { tenantId: tenantDbId },
    });

    if (!sendResult?.success) {
      console.error(
        "[api/estimate-builder/:id/send] Email send error",
        sendResult,
      );
      throw new Error(sendResult?.error || "Unable to send estimate email");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/estimate-builder/:id/send] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
