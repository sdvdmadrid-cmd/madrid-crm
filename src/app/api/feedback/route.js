import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

const FEEDBACK_TABLE = "product_feedback";
const FEEDBACK_TYPES = new Set(["suggestion", "issue", "improvement"]);

function normalizeType(value) {
  const normalized = String(value || "suggestion").trim().toLowerCase();
  return FEEDBACK_TYPES.has(normalized) ? normalized : "suggestion";
}

function normalizeMessage(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 4000);
}

function normalizeCurrentPage(value) {
  return String(value || "").trim().slice(0, 300);
}

function normalizeScreenshotDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("data:image/")) {
    throw new Error("Screenshot must be an image.");
  }
  if (raw.length > 2_000_000) {
    throw new Error("Screenshot is too large. Keep it under 2MB.");
  }
  return raw;
}

export async function POST(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    if (!context?.authenticated || !context?.userId || !context?.tenantDbId) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const feedbackType = normalizeType(body.type);
    const message = normalizeMessage(body.message);
    const currentPage = normalizeCurrentPage(body.currentPage);
    const screenshotDataUrl = normalizeScreenshotDataUrl(body.screenshotDataUrl);

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: "Message is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const nowIso = new Date().toISOString();
    const insertPayload = {
      tenant_id: context.tenantDbId,
      user_id: context.userId,
      feedback_type: feedbackType,
      message,
      screenshot_data_url: screenshotDataUrl || null,
      current_page: currentPage || null,
      status: "new",
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data, error } = await supabaseAdmin
      .from(FEEDBACK_TABLE)
      .insert(insertPayload)
      .select("id,feedback_type,message,status,created_at,current_page")
      .maybeSingle();

    if (error) {
      console.error("[api/feedback][POST] DB error", error);
      return new Response(
        JSON.stringify({ success: false, error: "Unable to submit feedback" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    // Only surface user-facing validation messages (our own code). Never surface DB/library errors.
    const isUserFacing = error.message && (
      error.message.startsWith("Screenshot") ||
      error.message === "Message is required"
    );
    console.error("[api/feedback][POST] error", isUserFacing ? "" : error);
    return new Response(
      JSON.stringify({ success: false, error: isUserFacing ? error.message : "Unable to submit feedback" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
}
