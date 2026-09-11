import { enforceSameOriginForMutation } from "@/lib/request-security";
import { enrichJobWithPartyInfo } from "@/lib/client-document-party";
import { buildPublicJobProgressLink } from "@/lib/job-progress-access";
import { deliverJobProgressNotifications } from "@/lib/job-progress-notify";
import { logSupabaseError } from "@/lib/supabase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

const JOBS = "jobs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveAuthorizedJob({ id, tenantDbId, role }) {
  let query = supabaseAdmin
    .from(JOBS)
    .select("id, user_id, tenant_id, title, client_id, client_name")
    .eq("id", id)
    .maybeSingle();

  if ((role || "").toLowerCase() !== "super_admin") {
    query = supabaseAdmin
      .from(JOBS)
      .select("id, user_id, tenant_id, title, client_id, client_name")
      .eq("id", id)
      .eq("tenant_id", tenantDbId)
      .maybeSingle();
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError("[api/jobs/:id/progress-link] job lookup", error, {
      id,
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }
  return data;
}

/**
 * POST /api/jobs/[id]/progress-link
 * Create a shareable live progress URL; optionally email/SMS the client.
 * Body: { notify?: boolean, email?: boolean, sms?: boolean }
 */
export async function POST(request, { params }) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated } = context;
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: jobId } = await params;
    if (!jobId) {
      return jsonResponse({ success: false, error: "Invalid job id" }, 400);
    }

    const job = await resolveAuthorizedJob({ id: jobId, tenantDbId, role });
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const notify = body.notify !== false;
    const wantEmail = body.email !== false;
    const wantSms = body.sms !== false;

    const origin = new URL(request.url).origin;
    const url = buildPublicJobProgressLink(jobId, origin);

    let delivery = {
      email: { attempted: false, sent: false, error: null },
      sms: { attempted: false, sent: false, error: null },
    };

    if (notify) {
      const enriched = await enrichJobWithPartyInfo(supabaseAdmin, tenantDbId, {
        clientId: job.client_id,
        clientName: job.client_name,
      });
      delivery = await deliverJobProgressNotifications({
        progressUrl: url,
        clientName: enriched.clientName || job.client_name || "",
        clientEmail: enriched.clientEmail || "",
        clientPhone: enriched.clientPhone || "",
        jobTitle: job.title || "",
        tenantId: tenantDbId,
        sendEmail: wantEmail,
        sendSms: wantSms,
      });
    }

    return jsonResponse({
      success: true,
      data: {
        jobId,
        url,
        expiresInDays: 90,
        notified: notify,
        delivery,
      },
    });
  } catch (error) {
    console.error("[api/jobs/:id/progress-link][POST] error", error);
    return jsonResponse({ success: false, error: "Unable to create progress link" }, 500);
  }
}
