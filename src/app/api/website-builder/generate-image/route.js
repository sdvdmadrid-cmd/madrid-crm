import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { resolveWebsiteImageContext } from "@/lib/website-builder-image-context";
import { generateWebsiteImage } from "@/lib/website-builder-image-generation";
import { assertSafeText } from "@/lib/input-sanitizer";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage } from "@/lib/ai-service";

export const maxDuration = 90;

function badRequest(error) {
  return Response.json({ success: false, error }, { status: 400 });
}

export async function POST(request) {
  const websiteBuilderEnabled = await isPlatformFeatureEnabled("feature_website_builder", true);
  if (!websiteBuilderEnabled) {
    return Response.json(
      { success: false, error: "Website Builder is currently disabled." },
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

  const { pack, websiteSlug, companyName } = await resolveWebsiteImageContext(
    access.tenantDbId,
  );
  const mediaKind =
    String(body.mediaKind || "hero").trim() === "gallery" ? "gallery" : "hero";
  const styleHint = String(body.style || "realistic").trim().slice(0, 40);
  const draft = body.publish !== true && body.draft !== false;

  try {
    const result = await generateWebsiteImage({
      tenantId: access.tenantDbId,
      websiteSlug,
      pack,
      companyName,
      prompt: safePrompt,
      style: styleHint,
      mediaKind,
      draft,
    });

    return Response.json({
      success: true,
      data: {
        imageDataUrl: result.imageDataUrl,
        imageUrl: result.imageUrl,
        persisted: result.persisted,
        alt: result.alt,
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
