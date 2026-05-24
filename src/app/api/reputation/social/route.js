import { supabaseAdmin } from "@/lib/supabase-admin";
import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import {
  listTenantSocialProfiles,
  normalizeSocialPlatform,
  serializeSocialProfile,
  syncTenantSocialLinksToWebsite,
} from "@/lib/reputation-store";

export async function GET(request) {
  const auth = await requirePrivateTenantApi(request);
  if (!auth.ok) return auth.response;

  try {
    const profiles = await listTenantSocialProfiles(auth.ctx.tenantDbId);
    return privateJson({ success: true, data: profiles });
  } catch (error) {
    console.error("[api/reputation/social][GET]", error);
    return privateJson({ success: false, error: "Unable to load social profiles" }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const platform = normalizeSocialPlatform(body.platform);
    const profileUrl = String(body.profileUrl || "").trim().slice(0, 500);
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("contractor_social_profiles")
      .upsert(
        {
          tenant_id: auth.ctx.tenantDbId,
          platform,
          profile_url: profileUrl,
          display_on_website: body.displayOnWebsite !== false,
          show_latest_content: body.showLatestContent === true,
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
          updated_at: now,
        },
        { onConflict: "tenant_id,platform" },
      )
      .select("*")
      .maybeSingle();

    if (error) throw error;

    await syncTenantSocialLinksToWebsite(auth.ctx.tenantDbId);

    return privateJson({ success: true, data: serializeSocialProfile(data) });
  } catch (error) {
    console.error("[api/reputation/social][POST]", error);
    return privateJson({ success: false, error: "Unable to save social profile" }, { status: 500 });
  }
}
