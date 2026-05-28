import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import {
  IMPORT_BATCH_SIZE,
  IMPORT_MAX_ROWS,
  commitClientImportBatch,
} from "@/lib/client-import-service";
import { DUPLICATE_MODES } from "@/lib/import-engine/client-fields";
import { parseJsonBody } from "@/lib/parse-json-body";

export const runtime = "nodejs";

/**
 * POST /api/clients/import/commit
 * Process one batch of mapped CSV rows (client sends chunks for large files).
 */
export async function POST(request) {
  const csrfBlock = applyMutationCsrfGuard(request);
  if (csrfBlock) return csrfBlock;

  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  try {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = sanitizePayloadDeep(parsed.body);
    const records = Array.isArray(body.records) ? body.records : [];
    const mapping =
      body.mapping && typeof body.mapping === "object" ? body.mapping : {};

    if (!records.length) {
      return privateJson(
        { success: false, error: "No rows in this batch" },
        { status: 400 },
      );
    }

    if (records.length > IMPORT_BATCH_SIZE) {
      return privateJson(
        {
          success: false,
          error: `Batch too large (max ${IMPORT_BATCH_SIZE} rows per request)`,
        },
        { status: 400 },
      );
    }

    const startRowIndex = Math.max(0, Number(body.startRowIndex) || 0);
    const totalRows = Math.max(0, Number(body.totalRows) || 0);

    if (totalRows > IMPORT_MAX_ROWS) {
      return privateJson(
        {
          success: false,
          error: `Import exceeds maximum of ${IMPORT_MAX_ROWS} rows`,
        },
        { status: 400 },
      );
    }

    const duplicateMode = DUPLICATE_MODES.includes(body.duplicateMode)
      ? body.duplicateMode
      : "skip";

    const seenKeys =
      body.seenKeys && typeof body.seenKeys === "object" ? body.seenKeys : null;

    const result = await commitClientImportBatch({
      tenantId: auth.ctx.tenantDbId,
      userId: auth.ctx.userId,
      records,
      mapping,
      duplicateMode,
      startRowIndex,
      seenKeys,
    });

    return privateJson({
      success: true,
      data: {
        ...result,
        startRowIndex,
        batchSize: records.length,
      },
    });
  } catch (error) {
    console.error("[api/clients/import/commit][POST]", {
      error: error?.message || String(error),
    });
    return privateJson(
      { success: false, error: error?.message || "Import batch failed" },
      { status: 500 },
    );
  }
}
