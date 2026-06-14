import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { uploadWebsiteImageFromDataUrl } from "@/lib/website-media-storage";
import { supabaseAdmin } from "@/lib/supabase-admin";

const WEBSITE_TABLE = "contractor_websites";

export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const dataUrl = String(body.dataUrl || "").trim();
  const kind = String(body.kind || "hero").slice(0, 40);

  if (!dataUrl.startsWith("data:image/")) {
    return Response.json({ success: false, error: "Invalid image payload" }, { status: 400 });
  }

  const { data: website } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .select("slug")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  const slug = String(website?.slug || "site");
  const url = await uploadWebsiteImageFromDataUrl({
    tenantId: access.tenantDbId,
    slug,
    dataUrl,
    kind,
  });

  if (!url) {
    return Response.json(
      { success: false, error: "Image upload failed. Check storage bucket configuration." },
      { status: 500 },
    );
  }

  return Response.json({ success: true, data: { url } });
}
