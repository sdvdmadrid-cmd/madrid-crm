import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { readWebsiteLiveSnapshot } from "@/lib/website-draft-snapshot";

const WEBSITE_TABLE = "contractor_websites";

export const dynamic = "force-dynamic";

/**
 * Issue #43 — discard all unpublished edits by snapshotting the live
 * columns back into draft_content. The public site is not touched.
 */
export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const { data: row, error: rowError } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .select("*")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  if (rowError || !row) {
    return Response.json(
      { success: false, error: "Website not found" },
      { status: 404 },
    );
  }

  const live = readWebsiteLiveSnapshot(row);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .update({
      draft_content: live,
      has_unpublished_changes: false,
      draft_updated_at: now,
      updated_at: now,
    })
    .eq("id", row.id);

  if (error) {
    console.error("[api/website-builder/discard-draft] DB error", error);
    return Response.json(
      { success: false, error: "Unable to discard draft" },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    data: { hasUnpublishedChanges: false },
  });
}
