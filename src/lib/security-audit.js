import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Best-effort security audit row (never blocks auth flows).
 */
export async function writeSecurityAudit({
  action,
  userId = "anonymous",
  tenantId = "",
  metadata = {},
}) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: String(userId || "anonymous"),
      tenant_id: String(tenantId || ""),
      action: String(action || "security.event"),
      metadata,
    });
  } catch (error) {
    console.warn("[security-audit] insert failed", error?.message || error);
  }
}
