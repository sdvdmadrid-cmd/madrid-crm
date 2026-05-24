import { publicWebsiteJson } from "@/lib/api-zone-guard";
import { getPublicReviewsBySlug } from "@/lib/reputation-store";

/** Public website only — no private tenant/CRM fields. */
export async function GET(_request, { params }) {
  const { slug } = await params;

  try {
    const { reviews, stats } = await getPublicReviewsBySlug(slug);
    return publicWebsiteJson({
      success: true,
      data: {
        reviews: reviews.map((r) => ({
          id: r.id,
          platform: r.platform,
          authorName: r.authorName,
          rating: r.rating,
          reviewText: r.reviewText,
          reviewDate: r.reviewDate,
          photoUrl: r.photoUrl,
          videoUrl: r.videoUrl,
          verified: r.verified,
          pinned: r.pinned,
          serviceType: r.serviceType,
        })),
        stats,
      },
    });
  } catch (error) {
    console.error("[api/site/reviews][GET]", error);
    return publicWebsiteJson({ success: false, error: "Unable to load reviews" }, { status: 500 });
  }
}
