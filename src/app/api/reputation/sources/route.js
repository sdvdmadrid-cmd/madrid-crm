import { privateJson, requirePrivateTenantApi } from "@/lib/api-zone-guard";
import {
  getReviewSources,
  upsertReviewSources,
} from "@/lib/reputation-sync";
import { parseYelpBusinessIdFromUrl } from "@/lib/reputation-sync/yelp";

export async function GET(request) {
  const auth = await requirePrivateTenantApi(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await getReviewSources(auth.ctx.tenantDbId);
    return privateJson({ success: true, data });
  } catch (error) {
    console.error("[api/reputation/sources][GET]", error);
    return privateJson({ success: false, error: "Failed to load sources" }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requirePrivateTenantApi(request, { write: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const yelpProfileUrl = String(body.yelpProfileUrl || "").trim();
    const data = await upsertReviewSources(auth.ctx.tenantDbId, {
      googlePlaceId: body.googlePlaceId,
      googleProfileUrl: body.googleProfileUrl,
      yelpBusinessId:
        body.yelpBusinessId || parseYelpBusinessIdFromUrl(yelpProfileUrl) || undefined,
      yelpProfileUrl,
    });
    return privateJson({ success: true, data });
  } catch (error) {
    console.error("[api/reputation/sources][POST]", error);
    return privateJson({ success: false, error: "Failed to save sources" }, { status: 500 });
  }
}
