import { buildJobInsertFromEstimate } from "@/lib/estimate-to-job";
import { normalizeEstimateStatusToken } from "@/lib/estimate-serializer";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { requireTenantIdForInsert, rowHasTenantId } from "@/lib/tenant-row-guard";

const ESTIMATES_TABLE = "estimates";
const JOBS_TABLE = "jobs";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const serializeJob = (doc) => ({
  id: doc.id,
  _id: doc.id,
  title: doc.title || "",
  clientId: doc.client_id || "",
  clientName: doc.client_name || "",
  service: doc.service || "",
  status: doc.status || "Pending",
});

/**
 * POST /api/estimates/:id/convert-to-job
 *
 * Creates a job from an approved estimate and links estimates.job_id.
 * Idempotent when a job is already linked.
 */
export async function POST(request, { params }) {
  const csrfBlock = applyMutationCsrfGuard(request);
  if (csrfBlock) return csrfBlock;

  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, userId, role, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) return json({ success: false, error: "Invalid estimate id" }, 400);

    let query = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }
    const { data: estimate, error: readError } = await query;
    if (readError) throw new Error(readError.message);
    if (!estimate) return json({ success: false, error: "Estimate not found" }, 404);
    if (!rowHasTenantId(estimate)) {
      return json({ success: false, error: "Estimate not found" }, 404);
    }

    const status = normalizeEstimateStatusToken(estimate.status);
    if (status !== "approved") {
      return json(
        {
          success: false,
          error: "Only approved estimates can be converted to a job.",
        },
        400,
      );
    }

    const existingJobId = String(estimate.job_id || "").trim();
    if (existingJobId) {
      const { data: existingJob, error: jobReadError } = await supabaseAdmin
        .from(JOBS_TABLE)
        .select("id, title, client_id, client_name, service, status, tenant_id")
        .eq("id", existingJobId)
        .maybeSingle();
      if (jobReadError) throw new Error(jobReadError.message);
      if (existingJob) {
        return json({
          success: true,
          data: {
            job: serializeJob(existingJob),
            jobId: existingJob.id,
            estimateId: estimate.id,
            alreadyLinked: true,
          },
        });
      }
    }

    const nowIso = new Date().toISOString();
    const insertTenantId = requireTenantIdForInsert(
      estimate.tenant_id,
      "api/estimates/:id/convert-to-job",
    );
    const jobRow = buildJobInsertFromEstimate(estimate, {
      tenantId: insertTenantId,
      userId,
      nowIso,
    });

    const { data: insertedJob, error: insertError } = await supabaseAdmin
      .from(JOBS_TABLE)
      .insert(jobRow)
      .select("id, title, client_id, client_name, service, status")
      .single();
    if (insertError) throw new Error(insertError.message);

    const { error: linkError } = await supabaseAdmin
      .from(ESTIMATES_TABLE)
      .update({ job_id: insertedJob.id, updated_at: nowIso })
      .eq("id", estimate.id);
    if (linkError) throw new Error(linkError.message);

    return json({
      success: true,
      data: {
        job: serializeJob(insertedJob),
        jobId: insertedJob.id,
        estimateId: estimate.id,
        alreadyLinked: false,
      },
    });
  } catch (error) {
    console.error("[api/estimates/:id/convert-to-job] error", {
      error: error?.message || String(error),
    });
    return json({ success: false, error: error.message || "Unable to convert estimate" }, 500);
  }
}
