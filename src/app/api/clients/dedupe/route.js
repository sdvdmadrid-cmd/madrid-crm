import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  previewClientDuplicates,
  removeDuplicateClients,
} from "@/lib/client-dedupe-service";
import { canDelete } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * GET /api/clients/dedupe — preview duplicate groups
 */
export async function GET(request) {
  const auth = await requirePrivateTenantApi(request);
  if (!auth.ok) return auth.response;

  if (!canDelete(auth.ctx.role)) {
    return privateJson(
      { success: false, error: "You do not have permission to remove duplicates." },
      { status: 403 },
    );
  }

  try {
    const preview = await previewClientDuplicates(auth.ctx.tenantDbId);
    return privateJson({ success: true, data: preview });
  } catch (error) {
    console.error("[api/clients/dedupe][GET]", error);
    return privateJson(
      { success: false, error: error?.message || "Unable to scan for duplicates" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/clients/dedupe — merge and delete duplicate client records
 */
export async function POST(request) {
  const csrfBlock = applyMutationCsrfGuard(request);
  if (csrfBlock) return csrfBlock;

  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  if (!canDelete(auth.ctx.role)) {
    return privateJson(
      { success: false, error: "You do not have permission to remove duplicates." },
      { status: 403 },
    );
  }

  try {
    const result = await removeDuplicateClients(auth.ctx.tenantDbId);
    return privateJson({ success: true, data: result });
  } catch (error) {
    console.error("[api/clients/dedupe][POST]", error);
    return privateJson(
      { success: false, error: error?.message || "Unable to remove duplicates" },
      { status: 500 },
    );
  }
}
