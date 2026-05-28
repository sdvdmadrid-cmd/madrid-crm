import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import {
  IMPORT_MAX_ROWS,
  IMPORT_PREVIEW_LIMIT,
  previewClientImport,
} from "@/lib/client-import-service";
import { DUPLICATE_MODES } from "@/lib/import-engine/client-fields";
import { parseJsonBody } from "@/lib/parse-json-body";

export const runtime = "nodejs";

/**
 * POST /api/clients/import/preview
 * Validate mapped CSV rows and classify duplicates before commit.
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
        { success: false, error: "No rows to preview" },
        { status: 400 },
      );
    }

    if (records.length > IMPORT_MAX_ROWS) {
      return privateJson(
        {
          success: false,
          error: `Too many rows (max ${IMPORT_MAX_ROWS}). Split the file or remove empty rows.`,
        },
        { status: 400 },
      );
    }

    const duplicateMode = DUPLICATE_MODES.includes(body.duplicateMode)
      ? body.duplicateMode
      : "skip";

    const limited = records.slice(0, IMPORT_PREVIEW_LIMIT);
    const { preview, summary } = await previewClientImport({
      tenantId: auth.ctx.tenantDbId,
      records: limited,
      mapping,
      duplicateMode,
    });

    return privateJson({
      success: true,
      data: {
        preview,
        summary: {
          ...summary,
          previewRowCount: limited.length,
          truncated: records.length > IMPORT_PREVIEW_LIMIT,
          totalRows: records.length,
        },
        duplicateMode,
      },
    });
  } catch (error) {
    console.error("[api/clients/import/preview][POST]", {
      error: error?.message || String(error),
    });
    return privateJson(
      { success: false, error: error?.message || "Preview failed" },
      { status: 500 },
    );
  }
}
