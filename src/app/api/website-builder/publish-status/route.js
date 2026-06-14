import { getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse, unauthenticatedResponse } from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Lightweight endpoint used by the navigation shell to decide whether the
 * "Build Website" entry should be relabeled to plain "Website" once the
 * tenant has a published contractor site.
 */
export async function GET(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();

  try {
    const { data, error } = await supabaseAdmin
      .from("contractor_websites")
      .select("slug, published")
      .eq("tenant_id", access.tenantDbId)
      .maybeSingle();

    if (error) {
      return Response.json({
        success: true,
        data: { exists: false, published: false, slug: null },
      });
    }

    return Response.json({
      success: true,
      data: {
        exists: Boolean(data),
        published: Boolean(data?.published),
        slug: data?.slug || null,
      },
    });
  } catch {
    return Response.json({
      success: true,
      data: { exists: false, published: false, slug: null },
    });
  }
}
