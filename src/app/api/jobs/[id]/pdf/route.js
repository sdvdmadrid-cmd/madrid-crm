import { enrichJobWithPartyInfo } from "@/lib/client-document-party";
import { getEstimateBrandingByTenant } from "@/lib/estimate-email-branding";
import { pdfResponse } from "@/lib/document-pdf-core";
import { buildJobPdfBuffer, pdfFilenameForJob } from "@/lib/job-pdf";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

const JOBS = "jobs";

function serializeJob(doc) {
  return {
    id: doc.id,
    _id: doc.id,
    tenantId: doc.tenant_id || "",
    title: doc.title || "",
    clientId: doc.client_id || "",
    clientName: doc.client_name || "",
    service: doc.service || "",
    status: doc.status || "Pending",
    price: doc.price || "",
    dueDate: doc.due_date || "",
    taxState: doc.tax_state || "",
    downPaymentPercent: doc.down_payment_percent || "0",
    scopeDetails: doc.scope_details || "",
  };
}

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) {
      return Response.json({ success: false, error: "Invalid job id" }, { status: 400 });
    }

    let query = supabaseAdmin.from(JOBS).select("*").eq("id", id).maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data) {
      return Response.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    let job = serializeJob(data);
    job = await enrichJobWithPartyInfo(
      supabaseAdmin,
      job.tenantId || tenantDbId,
      job,
    );
    const branding = await getEstimateBrandingByTenant(job.tenantId);
    const buffer = await buildJobPdfBuffer({ job, branding });
    const filename = pdfFilenameForJob(job);
    const download = new URL(request.url).searchParams.get("download") === "1";

    return pdfResponse(buffer, filename, { download });
  } catch (err) {
    console.error("[api/jobs/:id/pdf] error", err);
    return Response.json(
      { success: false, error: err?.message || "Failed to build PDF" },
      { status: 500 },
    );
  }
}
