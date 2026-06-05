import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  approveAchBatch,
  createAchBatchDraft,
  exportAchBatch,
  listAchBatchesForRun,
  markAchBatchTransmitted,
  rejectAchBatch,
  submitAchBatchForReview,
} from "@/lib/payroll-ach-service.js";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    if (!runId) {
      return Response.json({ success: false, error: "runId required." }, { status: 400 });
    }

    const batches = await listAchBatchesForRun({ tenantDbId, runId });
    return Response.json({ success: true, data: batches });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const action = String(body.action || "").toLowerCase();
    const runId = body.runId;
    const batchId = body.batchId;

    if (action === "create_draft") {
      const result = await createAchBatchDraft({ tenantDbId, runId, userId });
      return Response.json({ success: true, data: result });
    }
    if (action === "submit") {
      const batch = await submitAchBatchForReview({ tenantDbId, batchId, userId });
      return Response.json({ success: true, data: batch });
    }
    if (action === "approve") {
      const batch = await approveAchBatch({ tenantDbId, batchId, userId });
      return Response.json({ success: true, data: batch });
    }
    if (action === "reject") {
      const batch = await rejectAchBatch({
        tenantDbId,
        batchId,
        userId,
        reason: body.reason || "",
      });
      return Response.json({ success: true, data: batch });
    }
    if (action === "export") {
      const result = await exportAchBatch({ tenantDbId, batchId, userId });
      return Response.json({ success: true, data: result });
    }
    if (action === "transmit") {
      const batch = await markAchBatchTransmitted({ tenantDbId, batchId, userId });
      return Response.json({ success: true, data: batch });
    }

    return Response.json({ success: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("[api/payroll/ach/batches][POST]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
