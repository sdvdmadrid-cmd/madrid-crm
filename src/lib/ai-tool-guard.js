import "server-only";

import { writeAuditLog } from "@/lib/legal-enforcement.js";
import {
  describeAiToolAction,
  guardAiToolExecution,
} from "@/lib/ai-tool-guard-utils.js";

export {
  AI_TOOLS_REQUIRING_CONFIRM,
  describeAiToolAction,
  guardAiToolExecution,
} from "@/lib/ai-tool-guard-utils.js";

export async function logAiToolExecution({
  toolName,
  args = {},
  ctx = {},
  result = null,
  error = null,
  durationMs = 0,
}) {
  const safeArgs = { ...args };
  delete safeArgs.confirmed;
  await writeAuditLog({
    userId: ctx.userId,
    tenantId: ctx.tenantDbId,
    action: `ai.tool.${toolName}`,
    metadata: {
      ok: error ? false : result?.ok !== false,
      requiresConfirmation: Boolean(result?.requiresConfirmation),
      durationMs,
      error: error || result?.error || null,
      preview: result?.preview || null,
      entityIds: {
        invoiceId: result?.invoice?.id,
        estimateId: result?.estimate?.id,
        jobId: result?.job?.id,
        runId: result?.runId,
        clientId: result?.client?.id,
      },
      argKeys: Object.keys(safeArgs),
    },
  });
}
