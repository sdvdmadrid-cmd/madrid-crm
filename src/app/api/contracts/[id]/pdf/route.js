import { getEstimateBrandingByTenant } from "@/lib/estimate-email-branding";
import { pdfResponse } from "@/lib/document-pdf-core";
import { buildContractPdfBuffer, pdfFilenameForContract } from "@/lib/contract-pdf";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

const CONTRACTS = "contracts";

function serializeContract(doc) {
  return {
    id: doc.id,
    _id: doc.id,
    tenantId: doc.tenant_id || "",
    clientName: doc.client_name || "",
    jobTitle: doc.job_title || "",
    amount: doc.amount || "",
    status: doc.status || "Draft",
    contractCategory: doc.contract_category || "",
    contractOption: doc.contract_option || "",
    body: doc.body || "",
  };
}

export async function GET(request, { params }) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) {
      return Response.json({ success: false, error: "Invalid contract id" }, { status: 400 });
    }

    let query = supabaseAdmin.from(CONTRACTS).select("*").eq("id", id).maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data) {
      return Response.json({ success: false, error: "Contract not found" }, { status: 404 });
    }

    const contract = serializeContract(data);
    const branding = await getEstimateBrandingByTenant(contract.tenantId);
    const buffer = await buildContractPdfBuffer({ contract, branding });
    const filename = pdfFilenameForContract(contract);
    const download = new URL(request.url).searchParams.get("download") === "1";

    return pdfResponse(buffer, filename, { download });
  } catch (err) {
    console.error("[api/contracts/:id/pdf] error", err);
    return Response.json(
      { success: false, error: err?.message || "Failed to build PDF" },
      { status: 500 },
    );
  }
}
