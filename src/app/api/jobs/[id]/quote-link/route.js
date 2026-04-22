import crypto from "node:crypto";
import { logSupabaseError } from "@/lib/supabase-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canSendExternal,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const JOBS = "jobs";

export async function POST(request, { params }) {
  try {
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
        JSON.stringify({ success: false, error: "Invalid job id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const forceRotate = Boolean(body?.rotate);

    let jobQuery = supabaseAdmin.from(JOBS).select("*").eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      jobQuery = jobQuery.eq("tenant_id", tenantDbId);
    }

    const { data: job, error: jobError } = await jobQuery.maybeSingle();
    if (jobError) {
      logSupabaseError(
        "[api/jobs/:id/quote-link] Supabase job query error",
        jobError,
        { id, tenantDbId, role },
      );
      throw new Error(jobError.message);
    }

    if (!job) {
      return new Response(
        JSON.stringify({ success: false, error: "Job not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const quoteToken =
      !forceRotate && job.quote_token
        ? String(job.quote_token)
        : `${crypto.randomUUID().replace(/-/g, "")}${Date.now().toString(36)}`;

    const now = new Date();

    let updateQuery = supabaseAdmin
      .from(JOBS)
      .update({
        quote_token: quoteToken,
        quote_shared_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", id);

    if ((role || "").toLowerCase() !== "super_admin") {
      updateQuery = updateQuery.eq("tenant_id", tenantDbId);
    }

    const { error: updateError } = await updateQuery;
    if (updateError) {
      logSupabaseError(
        "[api/jobs/:id/quote-link] Supabase job update error",
        updateError,
        { id, tenantDbId, role, quoteToken },
      );
      throw new Error(updateError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          jobId: job.id,
          quoteToken,
          quotePath: `/quote/${quoteToken}`,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/jobs/:id/quote-link] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
