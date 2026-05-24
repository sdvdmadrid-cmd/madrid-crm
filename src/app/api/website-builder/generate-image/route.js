import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import {
  getCompanyProfileByTenant,
  withDefaultCompanyProfile,
} from "@/lib/company-profile-store";
import {
  getWebsiteBuilderPack,
  resolveWebsiteIndustryForWebsite,
} from "@/lib/website-builder-industry";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { uploadWebsiteImageFromDataUrl } from "@/lib/website-media-storage";
import { getOpenAiClient } from "@/lib/openai-client";
import { assertSafeText } from "@/lib/input-sanitizer";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage } from "@/lib/ai-service";

const IMAGE_MODEL = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim();
const IMAGE_SIZE = String(process.env.OPENAI_IMAGE_SIZE || "1024x1024").trim();

function badRequest(error) {
  return Response.json({ success: false, error }, { status: 400 });
}

function assertTrustedOpenAiImageUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("AI image URL is invalid");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("AI image URL must use HTTPS");
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = [
    "oaidalleapiprodscus.blob.core.windows.net",
    "cdn.openai.com",
    "files.openaiusercontent.com",
  ];

  const isAllowed = allowedHosts.includes(host);
  if (!isAllowed) {
    throw new Error("AI image URL host is not allowed");
  }

  return parsed.toString();
}

async function urlToDataUrl(imageUrl) {
  const trustedUrl = assertTrustedOpenAiImageUrl(imageUrl);
  const response = await fetch(trustedUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error("Unable to download AI image");
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 8 * 1024 * 1024) {
    throw new Error("AI image payload too large");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > 8 * 1024 * 1024) {
    throw new Error("AI image payload too large");
  }

  const mimeType = String(response.headers.get("content-type") || "image/png");
  if (!mimeType.toLowerCase().startsWith("image/")) {
    throw new Error("AI image payload is not an image");
  }

  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export async function POST(request) {
  const websiteBuilderEnabled = await isPlatformFeatureEnabled("feature_website_builder", true);
  if (!websiteBuilderEnabled) {
    return Response.json(
      { success: false, error: "Website Builder is currently disabled by feature flag." },
      { status: 403 },
    );
  }

  const aiDescriptionEnabled = await isPlatformFeatureEnabled("feature_ai_description", true);
  if (!aiDescriptionEnabled) {
    return Response.json(
      { success: false, error: "AI image generation is disabled by feature flag." },
      { status: 403 },
    );
  }

  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const safePrompt = assertSafeText("prompt", body.prompt || "", 320).trim();
  if (!safePrompt) {
    return badRequest("Image prompt is required");
  }

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({
      tenantId: access.tenantDbId,
    }),
    access.tenantDbId,
  );
  const { data: websiteRow } = await supabaseAdmin
    .from("contractor_websites")
    .select("slug, site_meta")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  const pack = getWebsiteBuilderPack(
    resolveWebsiteIndustryForWebsite(profile, websiteRow?.site_meta),
  );
  const websiteSlug = String(websiteRow?.slug || "draft").trim();
  const mediaKind =
    String(body.mediaKind || "hero").trim() === "gallery" ? "gallery" : "hero";
  const styleHint = String(body.style || "realistic").trim().slice(0, 40);
  const companyName = String(
    profile?.publicDisplayName || profile?.companyName || "",
  ).trim();

  const finalPrompt = [
    pack.imagePromptPrefix,
    `Business: ${companyName || pack.label}.`,
    safePrompt,
    `Style: ${styleHint}.`,
    "Photorealistic, high quality, natural lighting, no logos, no text, no watermarks.",
    `CRITICAL: Image must ONLY show ${pack.label} work.`,
    `Do NOT show: other trades, unrelated tools, or generic construction unless industry is construction.`,
  ].join(" ");

  try {
    const client = getOpenAiClient();
    const response = await client.images.generate({
      model: IMAGE_MODEL,
      prompt: finalPrompt,
      size: IMAGE_SIZE,
    });

    const first = response?.data?.[0] || null;
    if (!first) {
      throw new Error("AI did not return an image");
    }

    let imageDataUrl = "";
    if (first.b64_json) {
      imageDataUrl = `data:image/png;base64,${first.b64_json}`;
    } else if (first.url) {
      imageDataUrl = await urlToDataUrl(String(first.url));
    }

    if (!imageDataUrl.startsWith("data:image/")) {
      throw new Error("AI did not return a valid image payload");
    }

    let imageUrl = "";
    if (websiteSlug) {
      imageUrl = await uploadWebsiteImageFromDataUrl({
        tenantId: access.tenantDbId,
        slug: websiteSlug,
        dataUrl: imageDataUrl,
        kind: mediaKind,
      });
    }

    const persistedSrc =
      imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : imageDataUrl;

    return Response.json({
      success: true,
      data: {
        imageDataUrl: persistedSrc,
        imageUrl: persistedSrc,
        persisted: persistedSrc.startsWith("http"),
        alt: safePrompt.slice(0, 160),
      },
    });
  } catch (error) {
    const code = normalizeAiErrorCode(error?.code, error?.status, error?.message);
    return Response.json(
      buildAiErrorPayload({
        code,
        language: getRequestLanguage(request, "en"),
        status: Number(error?.status || 502),
        technicalMessage: error?.message || "AI image generation failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
