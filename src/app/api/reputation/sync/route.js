import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import { syncTenantReviewsFromSources } from "@/lib/reputation-sync";
import { syncTenantSocialLinksToWebsite } from "@/lib/reputation-store";

/**
 * POST /api/reputation/sync
 * Pull real reviews from connected Google Place + Yelp business.
 */
export async function POST(request) {
  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const platforms = Array.isArray(body.platforms)
      ? body.platforms.map((p) => String(p).toLowerCase())
      : [];

    const payload = await syncTenantReviewsFromSources(auth.ctx.tenantDbId, {
      platforms,
    });

    try {
      await syncTenantSocialLinksToWebsite(auth.ctx.tenantDbId);
    } catch (syncErr) {
      console.warn("[api/reputation/sync] social sync", syncErr?.message || syncErr);
    }

    return privateJson({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error("[api/reputation/sync][POST]", error);
    return privateJson(
      { success: false, error: error.message || "Sync failed" },
      { status: 500 },
    );
  }
}
