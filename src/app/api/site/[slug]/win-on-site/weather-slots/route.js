import { publicWebsiteJson } from "@/lib/api-zone-guard";
import { resolveWebsiteForLeadSubmission } from "@/lib/public-website-lead";
import {
  checkWebsiteLeadRateLimit,
  getRequestIp,
  recordWebsiteLeadAttempt,
} from "@/lib/rate-limit";
import {
  buildFullAddress,
  normalizeLeadPayload,
} from "@/lib/website-lead-form";
import { suggestWinOnSiteWeatherSlots } from "@/lib/win-on-site";

export async function POST(request, { params }) {
  const { slug } = await params;
  const ip = getRequestIp(request);

  const limitState = await checkWebsiteLeadRateLimit({ slug, ip });
  if (!limitState.allowed) {
    return Response.json(
      { error: "Too many submissions. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limitState.retryAfterSeconds || 60),
        },
      },
    );
  }

  const resolved = await resolveWebsiteForLeadSubmission(slug);
  if (!resolved.ok) {
    return publicWebsiteJson(
      {
        success: false,
        error: resolved.message,
        code: resolved.reason,
      },
      { status: resolved.status },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    await recordWebsiteLeadAttempt({ slug, ip });
    const payload = normalizeLeadPayload(body);
    if (payload.website) {
      return publicWebsiteJson({ success: true, slots: [] }, { status: 200 });
    }

    const fullAddress =
      buildFullAddress({
        addressLine1: payload.addressLine1,
        city: payload.city,
        state: payload.state,
        zipCode: payload.zipCode,
      }) ||
      [payload.city, payload.state, payload.zipCode].filter(Boolean).join(", ");

    const suggestion = await suggestWinOnSiteWeatherSlots({
      location: fullAddress,
      limit: Math.min(5, Math.max(3, Number(body.limit) || 5)),
    });

    return publicWebsiteJson(
      {
        success: suggestion.ok,
        location: suggestion.location || fullAddress,
        slots: suggestion.slots || [],
        disclaimer: suggestion.disclaimer || "",
        reason: suggestion.ok ? null : suggestion.reason || "unavailable",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[win-on-site/weather-slots] error", error);
    return publicWebsiteJson(
      {
        success: false,
        error: "Could not load weather-safe slots right now.",
        slots: [],
      },
      { status: 500 },
    );
  }
}
