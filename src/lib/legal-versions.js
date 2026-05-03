import "server-only";

import { DEFAULT_LEGAL_VERSION } from "@/lib/legal";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DEFAULT_SNAPSHOT =
  "FieldBase Legal & Compliance Terms v1.0 — April 30, 2026. Full content available at /legal.";

function normalizeTenantId(tenantId, userId) {
  return String(tenantId || userId || "").trim();
}

export async function getCurrentLegalVersionForTenant({ tenantId, userId }) {
  const scopedTenantId = normalizeTenantId(tenantId, userId);
  if (!scopedTenantId) {
    throw new Error("Missing tenant id for legal version lookup");
  }

  const { data, error } = await supabaseAdmin
    .from("legal_versions")
    .select("id, tenant_id, version_name, content_snapshot, created_at")
    .eq("tenant_id", scopedTenantId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("legal_versions")
    .upsert(
      {
        tenant_id: scopedTenantId,
        version_name: DEFAULT_LEGAL_VERSION,
        content_snapshot: DEFAULT_SNAPSHOT,
        is_current: true,
      },
      { onConflict: "tenant_id,version_name" },
    )
    .select("id, tenant_id, version_name, content_snapshot, created_at")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return inserted;
}
