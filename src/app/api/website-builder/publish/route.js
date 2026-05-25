import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { revalidatePublicWebsitePaths } from "@/lib/public-website-routing";
import {
  draftSnapshotToColumnPatch,
  hashDraftSnapshot,
  readWebsiteDraftSnapshot,
} from "@/lib/website-draft-snapshot";

const WEBSITE_TABLE = "contractor_websites";

export const dynamic = "force-dynamic";

/**
 * Issue #43 — atomically promote the draft snapshot into the live columns.
 * Public site routes keep reading the top-level columns, so this is the
 * single point where the public site can change.
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

  const draft = readWebsiteDraftSnapshot(row);
  const columnPatch = draftSnapshotToColumnPatch(draft);
  const now = new Date().toISOString();

  const update = {
    ...columnPatch,
    published: true,
    has_unpublished_changes: false,
    last_published_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .update(update)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) {
    console.error("[api/website-builder/publish] DB error", error);
    return Response.json(
      { success: false, error: "Unable to publish website" },
      { status: 500 },
    );
  }

  if (data?.slug) {
    revalidatePublicWebsitePaths(data.slug, revalidatePath);
  }

  return Response.json({
    success: true,
    data: {
      published: data.published === true,
      hasUnpublishedChanges: false,
      lastPublishedAt: data.last_published_at,
      slug: data.slug,
      publishHash: hashDraftSnapshot(draft),
    },
  });
}
