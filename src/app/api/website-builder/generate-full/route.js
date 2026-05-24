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
  buildCompactSiteCopyPrompt,
  buildFullSiteFromAi,
  buildInstantSiteFromIndustry,
  WEBSITE_AI_COPY_TIMEOUT_MS,
} from "@/lib/website-builder-generation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { runAiCompletion } from "@/lib/ai-service";

export const maxDuration = 25;

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

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AI copy timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
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

  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const services = Array.isArray(body.services) ? body.services : [];
  const existingForm =
    body.currentForm && typeof body.currentForm === "object" ? body.currentForm : {};
  const enhanceCopy = body.enhanceCopy !== false;

  const [profileRaw, websiteResult] = await Promise.all([
    getCompanyProfileByTenant({ tenantId: access.tenantDbId }),
    supabaseAdmin
      .from("contractor_websites")
      .select("site_meta")
      .eq("tenant_id", access.tenantDbId)
      .maybeSingle(),
  ]);

  const profile = withDefaultCompanyProfile(profileRaw, access.tenantDbId);
  const websiteRow = websiteResult?.data || null;

  const companyName =
    profile.publicDisplayName || profile.companyName || "Our Company";
  const industryKey = resolveWebsiteIndustryForWebsite(profile, websiteRow?.site_meta);
  const pack = getWebsiteBuilderPack(industryKey);

  const instantSite = buildInstantSiteFromIndustry(pack, profile, existingForm);
  let fullSite = instantSite;
  let source = "instant";

  const aiDescriptionEnabled = await isPlatformFeatureEnabled(
    "feature_ai_description",
    true,
  );

  if (enhanceCopy && aiDescriptionEnabled) {
    const topServices = services
      .slice(0, 12)
      .map(
        (s) =>
          `- ${s.name}${s.description ? `: ${String(s.description).slice(0, 80)}` : ""}`,
      )
      .join("\n");

    const ctx = {
      companyName,
      city: profile.businessCity || profile.city || "",
      phone: profile.phone || "",
      topServices,
      defaultServiceNames: pack.defaultServices.map((s) => s.name).join(", "),
    };

    try {
      const response = await withTimeout(
        runAiCompletion({
          request,
          tenantId: access.tenantDbId,
          userId: access.userId,
          feature: "website_builder_generate_full",
          modelTier: "mini",
          messages: [
            { role: "system", content: buildIndustryAiSystemPrompt(pack) },
            { role: "user", content: buildCompactSiteCopyPrompt(pack, ctx) },
          ],
          maxTokens: 750,
          temperature: 0.35,
        }),
        WEBSITE_AI_COPY_TIMEOUT_MS,
      );

      const parsed = parseAiJson(response.text || "{}");
      fullSite = buildFullSiteFromAi(parsed, pack, profile, existingForm);
      if (fullSite.siteMeta && typeof fullSite.siteMeta === "object") {
        fullSite.siteMeta.generationSource = "ai";
      }
      source = "ai";
    } catch {
      source = "ai_fallback";
    }
  }

  const heroPrompts = (fullSite.heroPhotos || []).map((p) => p.prompt).filter(Boolean);
  const galleryPrompts = fullSite.galleryImagePrompts || [];

  return Response.json({
    success: true,
    data: {
      ...fullSite,
      industry: industryKey,
      industryLabel: pack.label,
      source,
      imagePlan: {
        optional: true,
        heroCount: fullSite.heroPhotos?.length || 0,
        galleryCount: galleryPrompts.length,
        heroPrompts,
        galleryPrompts,
      },
    },
  });
}
