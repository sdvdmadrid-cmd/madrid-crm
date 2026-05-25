import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  findReviewRequestByToken,
  isReviewRequestUsable,
  markReviewRequestResponded,
  serializeReviewRequest,
} from "@/lib/review-requests";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import {
  checkPublicQuoteRateLimit,
  recordPublicQuoteAttempt,
  getRequestIp,
} from "@/lib/rate-limit";

const REVIEWS_TABLE = "contractor_reviews";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function loadBrandingForTenant(tenantId) {
  try {
    const profile = await getCompanyProfileByTenant({ tenantId });
    return {
      companyName: String(profile?.companyName || "").trim(),
      logoUrl: String(profile?.logoUrl || "").trim(),
      themeColor: String(profile?.themeColor || "").trim(),
    };
  } catch {
    return { companyName: "", logoUrl: "", themeColor: "" };
  }
}

/**
 * GET /api/public/review-requests/[token]
 * Public verification endpoint used by the /r/[token] landing page.
 * Returns minimal contractor branding + "already responded" flag.
 */
export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    const row = await findReviewRequestByToken(token);
    if (!row) {
      return jsonResponse({ success: false, error: "Invalid or expired review link." }, 404);
    }
    if (!isReviewRequestUsable(row)) {
      return jsonResponse({
        success: false,
        error: row.status === "responded"
          ? "This review was already submitted. Thank you!"
          : "This review link is no longer active.",
        status: row.status,
      }, 410);
    }

    const branding = await loadBrandingForTenant(row.tenant_id);

    return jsonResponse({
      success: true,
      data: {
        tenantId: row.tenant_id,
        customerName: row.customer_name || "",
        message: row.message || "",
        expiresAt: row.expires_at,
        branding,
      },
    });
  } catch (error) {
    console.error("[api/public/review-requests/:token][GET]", error);
    return jsonResponse({ success: false, error: "Unable to load review form" }, 500);
  }
}

/**
 * POST /api/public/review-requests/[token]
 * Public submission endpoint. Validates the token, inserts a
 * `contractor_reviews` row (verified=true, since the token proves the
 * customer was contacted by the contractor), and marks the request
 * responded.
 *
 * Body:
 *   - rating: 1..5
 *   - reviewText: string (required, max 4000)
 *   - authorName?: string (overrides the request's customer_name)
 *   - serviceType?: string
 *   - showOnWebsite?: boolean (default true)
 */
export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const ip = getRequestIp(request);
    const rateLimit = await checkPublicQuoteRateLimit({
      token,
      ip,
      action: "review-submit",
    });
    if (rateLimit && rateLimit.ok === false) {
      return jsonResponse(
        { success: false, error: "Too many submissions. Please wait a moment." },
        429,
      );
    }
    await recordPublicQuoteAttempt({ token, ip, action: "review-submit" });
    const row = await findReviewRequestByToken(token);
    if (!row) {
      return jsonResponse({ success: false, error: "Invalid or expired review link." }, 404);
    }
    if (!isReviewRequestUsable(row)) {
      return jsonResponse(
        {
          success: false,
          error: row.status === "responded"
            ? "This review was already submitted. Thank you!"
            : "This review link is no longer active.",
        },
        410,
      );
    }

    const body = await request.json().catch(() => ({}));
    const ratingRaw = Number(body.rating);
    if (!Number.isFinite(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
      return jsonResponse(
        { success: false, error: "Please pick a rating between 1 and 5 stars." },
        400,
      );
    }
    const rating = Math.round(ratingRaw * 10) / 10;
    const reviewText = String(body.reviewText || "").trim().slice(0, 4000);
    if (!reviewText) {
      return jsonResponse(
        { success: false, error: "Please share a few words about your experience." },
        400,
      );
    }

    const authorName =
      String(body.authorName || "").trim() || row.customer_name || "Customer";
    const serviceType = String(body.serviceType || "").trim().slice(0, 200);
    const showOnWebsite = body.showOnWebsite !== false;

    const insertPayload = {
      tenant_id: row.tenant_id,
      platform: "manual",
      source_url: "",
      author_name: authorName.slice(0, 200),
      rating,
      review_text: reviewText,
      review_date: new Date().toISOString().slice(0, 10),
      photo_url: "",
      video_url: "",
      service_type: serviceType,
      // Verified=true because we know the request token was sent by the
      // contractor and submitted by someone with the link in hand.
      verified: true,
      pinned: false,
      hidden: false,
      show_on_website: showOnWebsite,
      metadata: {
        source: "review_request",
        requestId: row.id,
        jobId: row.job_id || null,
        invoiceId: row.invoice_id || null,
        estimateId: row.estimate_id || null,
      },
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from(REVIEWS_TABLE)
      .insert(insertPayload)
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error(
        "[api/public/review-requests/:token][POST] insert failed",
        insertError.message,
      );
      return jsonResponse(
        { success: false, error: "Unable to save your review. Please try again." },
        500,
      );
    }

    await markReviewRequestResponded({
      id: row.id,
      reviewId: inserted?.id || null,
      rating,
    });

    return jsonResponse({
      success: true,
      data: { reviewId: inserted?.id || null, request: serializeReviewRequest(row) },
    });
  } catch (error) {
    console.error("[api/public/review-requests/:token][POST]", error);
    return jsonResponse(
      { success: false, error: "Unable to submit review" },
      500,
    );
  }
}
