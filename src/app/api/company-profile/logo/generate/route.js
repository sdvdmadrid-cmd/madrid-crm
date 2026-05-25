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
import { supabaseAdmin } from "@/lib/supabase-admin";
import { uploadCompanyLogoFromDataUrl } from "@/lib/website-media-storage";
import { getOpenAiClient } from "@/lib/openai-client";
import { assertSafeText } from "@/lib/input-sanitizer";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage } from "@/lib/ai-service";

const IMAGE_MODEL = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim();
const IMAGE_SIZE = String(process.env.OPENAI_LOGO_SIZE || "1024x1024").trim();

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_AI_IMAGE_HOSTS = new Set([
  "oaidalleapiprodscus.blob.core.windows.net",
  "cdn.openai.com",
  "files.openaiusercontent.com",
]);

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
  if (!ALLOWED_AI_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("AI image URL host is not allowed");
  }
  return parsed.toString();
}

async function openAiUrlToDataUrl(imageUrl) {
  const trustedUrl = assertTrustedOpenAiImageUrl(imageUrl);
  const response = await fetch(trustedUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Unable to download AI image");
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > 8 * 1024 * 1024) {
    throw new Error("AI image payload too large");
  }
  const mimeType = String(response.headers.get("content-type") || "image/png");
  if (!mimeType.toLowerCase().startsWith("image/")) {
    throw new Error("AI image payload is not an image");
  }
  return `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
}

/**
 * Issue #40 — AI logo generation with a 3D / dimensional house style.
 *
 * The prompt is curated for "modern 3D mark suitable for an app icon
 * or business card", which is what the user asked for. The model
 * returns a PNG, we upload it to the website-media bucket under
 * logos/{tenant} and stamp `company_profiles.logo_url`.
 */
export async function POST(request) {
  const websiteBuilderEnabled = await isPlatformFeatureEnabled(
    "feature_website_builder",
    true,
  );
  if (!websiteBuilderEnabled) {
    return Response.json(
      { success: false, error: "Website Builder is currently disabled." },
      { status: 403 },
    );
  }

  const aiEnabled = await isPlatformFeatureEnabled("feature_ai_description", true);
  if (!aiEnabled) {
    return Response.json(
      { success: false, error: "AI logo generation is disabled by feature flag." },
      { status: 403 },
    );
  }

  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const userPrompt = assertSafeText("prompt", body.prompt || "", 240).trim();
  const accentColor = assertSafeText(
    "accentColor",
    body.accentColor || "",
    24,
  ).trim();

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({ tenantId: access.tenantDbId }),
    access.tenantDbId,
  );
  const brand = String(
    profile?.publicDisplayName || profile?.companyName || "",
  ).trim();
  const industry = String(profile?.businessType || "").trim();

  const finalPrompt = [
    "Modern 3D vector logo mark, dimensional with soft realistic shading and depth,",
    "studio lighting, glossy beveled edges, subtle drop shadow, isolated on a pure white background,",
    "no text or letters in the artwork, centered composition, square aspect, suitable for an app icon or business card.",
    brand ? `Brand: ${brand}.` : "",
    industry ? `Industry: ${industry}.` : "",
    accentColor ? `Primary accent color: ${accentColor}.` : "",
    userPrompt ? `Concept: ${userPrompt}.` : "",
    "Avoid clutter, avoid photorealistic scenes, avoid watermarks, avoid taglines, avoid stock-photo styles.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const client = getOpenAiClient();
    const response = await client.images.generate(
      {
        model: IMAGE_MODEL,
        prompt: finalPrompt,
        size: IMAGE_SIZE,
      },
      { timeout: 60_000 },
    );

    const first = response?.data?.[0] || null;
    if (!first) throw new Error("AI did not return a logo");

    let dataUrl = "";
    if (first.b64_json) {
      dataUrl = `data:image/png;base64,${first.b64_json}`;
    } else if (first.url) {
      dataUrl = await openAiUrlToDataUrl(String(first.url));
    }
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("AI did not return a valid logo payload");
    }

    const persistedUrl = await uploadCompanyLogoFromDataUrl({
      tenantId: access.tenantDbId,
      dataUrl,
    });
    if (!persistedUrl) {
      throw new Error(
        "Logo generated but upload to storage failed. Check website-media bucket.",
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from("company_profiles")
      .update({ logo_url: persistedUrl, updated_at: new Date().toISOString() })
      .eq("tenant_id", access.tenantDbId);

    if (profileError) {
      console.error(
        "[api/company-profile/logo/generate] DB update failed",
        profileError,
      );
    }

    return Response.json({
      success: true,
      data: {
        logoUrl: persistedUrl,
        prompt: finalPrompt,
      },
    });
  } catch (error) {
    const code = normalizeAiErrorCode(error?.code, error?.status, error?.message);
    return Response.json(
      buildAiErrorPayload({
        code,
        language: getRequestLanguage(request, "en"),
        status: Number(error?.status || 502),
        message: String(error?.message || "AI logo generation failed"),
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
