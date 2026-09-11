import { enforceSameOriginForMutation } from "@/lib/request-security";
import { publishJobPhotoToPortfolio } from "@/lib/job-portfolio-publish";
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
    .select("id, user_id, tenant_id, title, service")
    .eq("id", id)
    .maybeSingle();

  if ((role || "").toLowerCase() !== "super_admin") {
    query = supabaseAdmin
      .from(JOBS)
      .select("id, user_id, tenant_id, title, service")
      .eq("id", id)
      .eq("tenant_id", tenantDbId)
      .maybeSingle();
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError("[api/jobs/.../publish-portfolio] job lookup", error, {
      id,
      tenantDbId,
      role,
    });
    throw new Error(error.message);
  }
  return data;
}

/**
 * POST /api/jobs/[id]/files/[fileId]/publish-portfolio
 * Copy a job photo into the website draft gallery.
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

    const { id: jobId, fileId } = await params;
    if (!jobId || !fileId) {
      return jsonResponse({ success: false, error: "Invalid ids" }, 400);
    }

    const job = await resolveAuthorizedJob({ id: jobId, tenantDbId, role });
    if (!job) {
      return jsonResponse({ success: false, error: "Job not found" }, 404);
    }

    const published = await publishJobPhotoToPortfolio({
      tenantId: tenantDbId,
      jobId,
      fileId,
      throwOnError: false,
    });

    if (!published.ok) {
      if (published.reason === "no_website") {
        return jsonResponse(
          {
            success: false,
            error: "No website found. Create a site in Website Builder first.",
            code: "NO_WEBSITE",
          },
          404,
        );
      }
      if (published.reason === "not_a_photo") {
        return jsonResponse(
          { success: false, error: "Only photos can be added to the website portfolio" },
          400,
        );
      }
      if (published.reason === "file_not_found") {
        return jsonResponse({ success: false, error: "File not found" }, 404);
      }
      return jsonResponse(
        { success: false, error: "Unable to add photo to portfolio" },
        500,
      );
    }

    return jsonResponse({
      success: true,
      data: {
        url: published.url,
        galleryCount: published.galleryCount,
        unpublished: true,
      },
    });
  } catch (error) {
    console.error("[api/jobs/.../publish-portfolio][POST] error", error);
    return jsonResponse(
      { success: false, error: "Unable to add photo to portfolio" },
      500,
    );
  }
}
