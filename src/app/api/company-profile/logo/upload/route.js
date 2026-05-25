import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { uploadCompanyLogoFromDataUrl } from "@/lib/website-media-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Issue #40 — manual logo upload for the contractor's company profile.
 *
 * Accepts a base64 data URL in `dataUrl` (frontend reads the chosen
 * file via FileReader). Persists the image into the public
 * website-media bucket and updates `company_profiles.logo_url`.
 *
 * The legacy `logo_data_url` column is left untouched so any old
 * surface that still reads it keeps rendering until we migrate.
 */
export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const dataUrl = String(body?.dataUrl || "").trim();
  if (!dataUrl.startsWith("data:image/")) {
    return Response.json(
      { success: false, error: "Invalid image payload" },
      { status: 400 },
    );
  }

  const url = await uploadCompanyLogoFromDataUrl({
    tenantId: access.tenantDbId,
    dataUrl,
  });
  if (!url) {
    return Response.json(
      {
        success: false,
        error:
          "Logo upload failed. Check the website-media storage bucket configuration.",
      },
      { status: 500 },
    );
  }

  const { error } = await supabaseAdmin
    .from("company_profiles")
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq("tenant_id", access.tenantDbId);

  if (error) {
    console.error("[api/company-profile/logo/upload] DB error", error);
    return Response.json(
      { success: false, error: "Logo uploaded but profile update failed" },
      { status: 500 },
    );
  }

  return Response.json({ success: true, data: { logoUrl: url } });
}
