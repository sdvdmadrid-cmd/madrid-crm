import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { revalidatePublicWebsitePaths } from "@/lib/public-website-routing";

const WEBSITE_TABLE = "contractor_websites";

export const dynamic = "force-dynamic";

/**
 * Issue #43 — hide the public site without losing the draft.
 * The draft and last_published snapshot stay intact; only `published`
 * flips to false so the public route stops serving the site.
 */
export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const { data: row, error: rowError } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .select("id, slug")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  if (rowError || !row) {
    return Response.json(
      { success: false, error: "Website not found" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .update({ published: false, updated_at: now })
    .eq("id", row.id)
    .select("id, slug, published")
    .single();

  if (error) {
    console.error("[api/website-builder/unpublish] DB error", error);
    return Response.json(
      { success: false, error: "Unable to unpublish website" },
      { status: 500 },
    );
  }

  if (data?.slug) {
    revalidatePublicWebsitePaths(data.slug, revalidatePath);
  }

  return Response.json({
    success: true,
    data: { published: data.published === true, slug: data.slug },
  });
}
