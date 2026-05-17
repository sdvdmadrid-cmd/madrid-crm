import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
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

  const profile = await getCompanyProfileByTenant({
    tenantId: access.tenantDbId,
  });
  const businessType = String(profile?.businessType || "contractor").trim();

  const finalPrompt = [
    `Professional website hero/gallery photo for a ${businessType} business.`,
    safePrompt,
    "Realistic, high quality, clean composition, no logos or text overlays.",
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

    return Response.json({
      success: true,
      data: {
        imageDataUrl,
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
