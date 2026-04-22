import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const CONTRACTS = "contracts";

const serialize = (doc) => ({
  _id: doc.id,
  id: doc.id,
  clientId: doc.client_id || "",
  clientName: doc.client_name || "",
  jobId: doc.job_id || "",
  jobTitle: doc.job_title || "",
  amount: doc.amount || "",
  status: doc.status || "Draft",
  contractLanguage: doc.contract_language || "en",
  contractCategory: doc.contract_category || "",
  contractOption: doc.contract_option || "",
  body: doc.body || "",
  createdAt: doc.created_at || null,
  updatedAt: doc.updated_at || null,
});

export async function PATCH(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) {
      return Response.json(
        { success: false, error: "Invalid contract id" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const updatedAt = new Date().toISOString();

    const allowed = [
      "clientId",
      "clientName",
      "jobId",
      "jobTitle",
      "amount",
      "status",
      "contractLanguage",
      "contractCategory",
      "contractOption",
      "body",
    ];

    const updateRow = { updated_at: updatedAt };
    if ("clientId" in body) updateRow.client_id = String(body.clientId || "");
    if ("clientName" in body)
      updateRow.client_name = String(body.clientName || "");
    if ("jobId" in body) updateRow.job_id = String(body.jobId || "");
    if ("jobTitle" in body) updateRow.job_title = String(body.jobTitle || "");
    if ("amount" in body) updateRow.amount = String(body.amount || "");
    if ("status" in body) updateRow.status = String(body.status || "Draft");
    if ("contractLanguage" in body) {
      updateRow.contract_language = String(body.contractLanguage || "en");
    }
    if ("contractCategory" in body) {
      updateRow.contract_category = String(body.contractCategory || "");
    }
    if ("contractOption" in body) {
      updateRow.contract_option = String(body.contractOption || "");
    }
    if ("body" in body) updateRow.body = String(body.body || "").trim();

    const touchedAnyAllowed = allowed.some((key) => key in body);
    if (!touchedAnyAllowed) {
      return Response.json(
        { success: false, error: "No valid contract fields provided" },
        { status: 400 },
      );
    }

    if ("body" in updateRow && !updateRow.body) {
      return Response.json(
        { success: false, error: "Contract body is required" },
        { status: 400 },
      );
    }

    let updateQuery = supabaseAdmin
      .from(CONTRACTS)
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      updateQuery = supabaseAdmin
        .from(CONTRACTS)
        .update(updateRow)
        .eq("id", id)
        .eq("tenant_id", tenantDbId)
        .select("*")
        .maybeSingle();
    }

    const { data: updated, error } = await updateQuery;

    if (error) {
      console.error("[api/contracts/:id][PATCH] Supabase update error", error);
      return Response.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    if (!updated) {
      return Response.json(
        { success: false, error: "Contract not found" },
        { status: 404 },
      );
    }

    return Response.json({ success: true, data: serialize(updated) });
  } catch (error) {
    console.error("[api/contracts/:id][PATCH] error", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
