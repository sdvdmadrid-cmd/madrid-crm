import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { resolveWebsiteImageContext } from "@/lib/website-builder-image-context";
import { generateWebsiteImagesBatch } from "@/lib/website-builder-image-generation";
import { assertSafeText } from "@/lib/input-sanitizer";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage } from "@/lib/ai-service";

export const maxDuration = 300;

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
  const basePrompt = assertSafeText("prompt", body.prompt || body.basePrompt || "", 320).trim();
  const count = Math.min(10, Math.max(1, Number(body.count) || 1));
  const styleHint = String(body.style || "realistic").trim().slice(0, 40);
  const mediaKind =
    String(body.mediaKind || "gallery").trim() === "hero" ? "hero" : "gallery";
  const draft = body.publish !== true && body.draft !== false;

  const explicitPrompts = Array.isArray(body.prompts)
    ? body.prompts
        .map((entry) => assertSafeText("prompt", entry?.prompt || entry || "", 320).trim())
        .filter(Boolean)
    : [];

  const prompts =
    explicitPrompts.length > 0
      ? explicitPrompts.slice(0, 10)
      : basePrompt
        ? Array.from({ length: count }, (_, i) => `${basePrompt}, variation ${i + 1}`)
        : [];

  if (prompts.length === 0) {
    return Response.json({ success: false, error: "Image prompt is required" }, { status: 400 });
  }

  const { pack, websiteSlug, companyName } = await resolveWebsiteImageContext(
    access.tenantDbId,
  );

  try {
    const images = await generateWebsiteImagesBatch({
      tenantId: access.tenantDbId,
      websiteSlug,
      pack,
      companyName,
      prompts,
      style: styleHint,
      mediaKind,
      draft,
    });

    return Response.json({
      success: true,
      data: {
        images: images.map((row) => ({
          promptIndex: row.promptIndex,
          imageUrl: row.imageUrl,
          imageDataUrl: row.imageDataUrl,
          persisted: row.persisted,
          alt: row.alt,
        })),
        generated: images.length,
        requested: prompts.length,
      },
    });
  } catch (error) {
    const code = normalizeAiErrorCode(error?.code, error?.status, error?.message);
    return Response.json(
      buildAiErrorPayload({
        code,
        language: getRequestLanguage(request, "en"),
        status: Number(error?.status || 502),
        technicalMessage: error?.message || "Batch image generation failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
