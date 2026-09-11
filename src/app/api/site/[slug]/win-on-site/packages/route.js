import { publicWebsiteJson } from "@/lib/api-zone-guard";
import { resolveWebsiteForLeadSubmission } from "@/lib/public-website-lead";
import {
  checkWebsiteLeadRateLimit,
  getRequestIp,
  recordWebsiteLeadAttempt,
} from "@/lib/rate-limit";
import {
  buildFullAddress,
  isAllowedRequestService,
  normalizeLeadPayload,
  resolveLeadServiceNeeded,
  resolveWebsiteRequestServices,
} from "@/lib/website-lead-form";
import {
  resolveWinOnSiteBaseDraft,
  serializeWinOnSitePackagesForPublic,
  buildWinOnSitePackages,
} from "@/lib/win-on-site";
import crypto from "crypto";

const MIN_FORM_FILL_MS = 800;

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

  const website = resolved.website;

  try {
    const body = await request.json().catch(() => ({}));

    // Rate-limited only. Final contact submit still enforces Turnstile.
    await recordWebsiteLeadAttempt({ slug, ip });
    const payload = normalizeLeadPayload(body);
    if (payload.website) {
      return publicWebsiteJson({ success: true, packages: {} }, { status: 200 });
    }

    const startedAtMs = Number(payload.formStartedAt || 0);
    const elapsedMs = Date.now() - startedAtMs;
    if (!Number.isFinite(startedAtMs) || elapsedMs < MIN_FORM_FILL_MS) {
      return Response.json({ error: "Invalid submission" }, { status: 400 });
    }

    const serviceNeeded = resolveLeadServiceNeeded(
      payload.serviceNeeded,
      payload.serviceOther,
    );
    const description = payload.description;
    if (!serviceNeeded || !description) {
      return Response.json(
        { error: "Service and project details are required" },
        { status: 400 },
      );
    }

    const allowedServices = resolveWebsiteRequestServices(website);
    if (allowedServices.length && !isAllowedRequestService(serviceNeeded, allowedServices)) {
      return Response.json({ error: "Invalid service selection" }, { status: 400 });
    }

    const fullAddress = buildFullAddress({
      addressLine1: payload.addressLine1,
      city: payload.city,
      state: payload.state,
      zipCode: payload.zipCode,
    });

    const { draft, source } = await resolveWinOnSiteBaseDraft({
      request,
      tenantId: website.tenantId,
      serviceNeeded,
      description,
      address: fullAddress,
      budgetRange: payload.budgetRange,
      timeline: payload.timeline,
      clientName: payload.name,
      photoUrls: [],
    });

    const packages = buildWinOnSitePackages(draft);
    const quoteSessionId = crypto.randomUUID().replace(/-/g, "").slice(0, 24);

    return publicWebsiteJson(
      {
        success: true,
        quoteSessionId,
        source,
        packages: serializeWinOnSitePackagesForPublic(packages),
        disclaimer:
          "Prices are estimates. Your contractor will confirm the final quote before work begins.",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[win-on-site/packages] error", error);
    return publicWebsiteJson(
      {
        success: false,
        error: "Could not build package options right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
