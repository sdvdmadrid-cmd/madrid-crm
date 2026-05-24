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
  buildIndustryAiSystemPrompt,
  getWebsiteBuilderPack,
  resolveWebsiteIndustryForWebsite,
} from "@/lib/website-builder-industry";
import {
  buildFullSiteCopyPrompt,
  buildFullSiteFromAi,
} from "@/lib/website-builder-generation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage, runAiCompletion } from "@/lib/ai-service";

function parseAiJson(raw) {
  const text = String(raw || "{}");
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI returned unexpected format");
  }
}

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

  const aiDescriptionEnabled = await isPlatformFeatureEnabled(
    "feature_ai_description",
    true,
  );
  if (!aiDescriptionEnabled) {
    return Response.json(
      { success: false, error: "AI generation is disabled by feature flag." },
      { status: 403 },
    );
  }

  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const services = Array.isArray(body.services) ? body.services : [];
  const existingForm =
    body.currentForm && typeof body.currentForm === "object" ? body.currentForm : {};

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({ tenantId: access.tenantDbId }),
    access.tenantDbId,
  );

  const { data: websiteRow } = await supabaseAdmin
    .from("contractor_websites")
    .select("site_meta")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  const companyName =
    profile.publicDisplayName || profile.companyName || "Our Company";
  const industryKey = resolveWebsiteIndustryForWebsite(profile, websiteRow?.site_meta);
  const pack = getWebsiteBuilderPack(industryKey);

  const topServices = services
    .slice(0, 12)
    .map((s) => `- ${s.name}${s.description ? `: ${s.description.slice(0, 80)}` : ""}`)
    .join("\n");

  const ctx = {
    companyName,
    city: profile.businessCity || profile.city || "",
    phone: profile.phone || "",
    topServices,
    defaultServiceNames: pack.defaultServices.map((s) => s.name).join(", "),
  };

  let raw = "{}";
  try {
    const response = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "website_builder_generate_full",
      modelTier: "standard",
      messages: [
        { role: "system", content: buildIndustryAiSystemPrompt(pack) },
        { role: "user", content: buildFullSiteCopyPrompt(pack, ctx) },
      ],
      maxTokens: 1400,
      temperature: 0.4,
    });
    raw = response.text || "{}";
  } catch (error) {
    const code = normalizeAiErrorCode(error?.aiCode || error?.code, error?.status, error?.message);
    return Response.json(
      buildAiErrorPayload({
        code,
        language: getRequestLanguage(request, "en"),
        status: Number(error?.status || 502),
        technicalMessage: error?.message || "AI request failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }

  let parsed;
  try {
    parsed = parseAiJson(raw);
  } catch {
    return Response.json(
      { success: false, error: "AI returned unexpected format. Try again." },
      { status: 500 },
    );
  }

  const fullSite = buildFullSiteFromAi(parsed, pack, profile, existingForm);

  return Response.json({
    success: true,
    data: {
      ...fullSite,
      industry: industryKey,
      industryLabel: pack.label,
      imagePlan: {
        heroCount: fullSite.heroPhotos.length,
        galleryCount: fullSite.galleryImagePrompts?.length || 2,
        heroPrompts: fullSite.heroPhotos.map((p) => p.prompt),
        galleryPrompts: fullSite.galleryImagePrompts || [],
      },
    },
  });
}
