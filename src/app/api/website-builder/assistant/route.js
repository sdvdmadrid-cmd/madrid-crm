import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
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
import {
  analyzeWebsiteCompleteness,
  buildWebsiteAssistantSystemPrompt,
  parseAssistantPatches,
} from "@/lib/website-builder-generation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage, runAiCompletion } from "@/lib/ai-service";

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
  const question = String(body.question || "").trim().slice(0, 2000);
  if (!question) {
    return Response.json({ success: false, error: "Question is required." }, { status: 400 });
  }

  const snapshot =
    body.snapshot && typeof body.snapshot === "object" ? body.snapshot : {};
  const form = snapshot.form && typeof snapshot.form === "object" ? snapshot.form : {};
  const siteMeta =
    snapshot.siteMeta && typeof snapshot.siteMeta === "object" ? snapshot.siteMeta : {};

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({ tenantId: access.tenantDbId }),
    access.tenantDbId,
  );

  const { data: websiteRow } = await supabaseAdmin
    .from("contractor_websites")
    .select("slug, published, site_meta")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  const mergedMeta = {
    ...(websiteRow?.site_meta && typeof websiteRow.site_meta === "object"
      ? websiteRow.site_meta
      : {}),
    ...siteMeta,
  };
  const industryKey = resolveWebsiteIndustryForWebsite(profile, mergedMeta);
  const pack = getWebsiteBuilderPack(industryKey);
  const completeness = analyzeWebsiteCompleteness(form, {
    ...siteMeta,
    ...(websiteRow?.site_meta && typeof websiteRow.site_meta === "object"
      ? websiteRow.site_meta
      : {}),
  });

  const enrichedSnapshot = {
    ...snapshot,
    published: snapshot.published ?? websiteRow?.published === true,
    websitePath: snapshot.websitePath || (websiteRow?.slug ? `/sites/${websiteRow.slug}` : ""),
    form,
    siteMeta: { ...siteMeta, ...completeness },
  };

  const systemPrompt = buildWebsiteAssistantSystemPrompt({
    pack,
    profile,
    snapshot: enrichedSnapshot,
    completeness,
  });

  let raw = "";
  try {
    const response = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "website_builder_assistant",
      modelTier: "mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      maxTokens: 900,
      temperature: 0.35,
    });
    raw = response.text || "";
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

  const { answer, patches } = parseAssistantPatches(raw);

  return Response.json({
    success: true,
    data: {
      answer,
      patches,
      completeness: {
        score: completeness.score,
        missing: completeness.missing,
        isComplete: completeness.isComplete,
      },
    },
  });
}
