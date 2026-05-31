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
  buildIndustryWebsiteDefaults,
  getWebsiteBuilderPack,
  personalizeGeneratedContent,
  resolveWebsiteIndustryForWebsite,
  sanitizeIndustryWebsiteContent,
} from "@/lib/website-builder-industry";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage, runAiCompletion } from "@/lib/ai-service";

function buildPromptForSection(section, pack, ctx) {
  const forbiddenNote = `FORBIDDEN topics (never mention): unrelated trades outside ${pack.label}.`;

  if (section === "hero") {
    return `
Company: ${ctx.companyName}
Industry: ${pack.label} ONLY
City: ${ctx.city || "local area"}
${forbiddenNote}

Generate hero copy for a ${pack.label} website. JSON only:
{
  "headline": "max 10 words, ${pack.label} specific",
  "subheadline": "max 28 words",
  "aboutText": "max 90 words",
  "ctaText": "max 5 words"
}
Examples of acceptable themes: ${pack.defaultHeadline}, ${pack.defaultSubheadline}
`.trim();
  }

  if (section === "services") {
    return `
Company: ${ctx.companyName}
Industry: ${pack.label} ONLY
${forbiddenNote}

Services list:
${ctx.topServices || ctx.defaultServiceNames}

Return JSON: { "services": [{ "name": "", "description": "", "price": "" }] }
Up to 6 services. Only ${pack.label} services.
`.trim();
  }

  if (section === "trust") {
    return `
Industry: ${pack.label}
Return JSON: { "trustBadges": [""] }
Up to 4 trust badges only. Do NOT generate customer reviews, testimonials, names, or ratings.
`.trim();
  }

  return `
Company name: ${ctx.companyName}
Industry: ${pack.label} (${pack.key}) — THIS IS THE ONLY ALLOWED INDUSTRY
Brand tone: ${pack.tone}
City/area: ${ctx.city || "(not provided)"}
Phone: ${ctx.phone || "(not provided)"}

Services offered:
${ctx.topServices || ctx.defaultServiceNames}

${forbiddenNote}
Required themes: ${pack.requestServices.join(", ")}

Generate website content. JSON only:
{
  "headline": "max 10 words",
  "subheadline": "max 28 words",
  "aboutText": "max 90 words",
  "ctaText": "max 5 words",
  "services": [{ "name": "", "description": "", "price": "" }],
  "trustBadges": [""]
}
Up to 6 services and 4 trust badges. Do NOT generate testimonials or fictional customer names.
First person plural (We/Our). ${pack.label} ONLY — never landscaping for cleaning, never cleaning for roofing, etc.
`.trim();
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
      { success: false, error: "AI description generation is disabled by feature flag." },
      { status: 403 },
    );
  }

  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const services = Array.isArray(body.services) ? body.services : [];
  const section = String(body.section || "all").trim().toLowerCase();

  const profile = withDefaultCompanyProfile(
    await getCompanyProfileByTenant({
      tenantId: access.tenantDbId,
    }),
    access.tenantDbId,
  );

  const { data: websiteRow } = await supabaseAdmin
    .from("contractor_websites")
    .select("site_meta")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  const companyName = profile.publicDisplayName || profile.companyName || "Our Company";
  const industryKey = resolveWebsiteIndustryForWebsite(profile, websiteRow?.site_meta);
  const pack = getWebsiteBuilderPack(industryKey);
  const defaults = buildIndustryWebsiteDefaults(pack, profile);

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

  const userPrompt = buildPromptForSection(section, pack, ctx);

  let raw = "{}";
  try {
    const response = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "website_builder_generate",
      modelTier: "mini",
      messages: [
        { role: "system", content: buildIndustryAiSystemPrompt(pack) },
        { role: "user", content: userPrompt },
      ],
      maxTokens: section === "hero" ? 280 : 900,
      temperature: 0.35,
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
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return Response.json(
          { success: false, error: "AI returned unexpected format. Try again." },
          { status: 500 },
        );
      }
    } else {
      return Response.json(
        { success: false, error: "AI returned unexpected format. Try again." },
        { status: 500 },
      );
    }
  }

  let content;
  if (section === "hero") {
    content = sanitizeIndustryWebsiteContent(
      {
        headline: parsed.headline || defaults.headline,
        subheadline: parsed.subheadline || defaults.subheadline,
        aboutText: parsed.aboutText || defaults.aboutText,
        ctaText: parsed.ctaText || defaults.ctaText,
        services: defaults.services,
        testimonials: [],
        trustBadges: defaults.trustBadges,
      },
      pack,
      profile,
    );
    return Response.json({
      success: true,
      data: {
        headline: content.headline,
        subheadline: content.subheadline,
        aboutText: content.aboutText,
        ctaText: content.ctaText,
        themeColor: pack.defaultThemeColor,
      },
    });
  }

  if (section === "services") {
    content = sanitizeIndustryWebsiteContent(
      { services: parsed.services, headline: defaults.headline, subheadline: defaults.subheadline },
      pack,
      profile,
    );
    return Response.json({
      success: true,
      data: { services: content.services, themeColor: pack.defaultThemeColor },
    });
  }

  if (section === "trust") {
    content = sanitizeIndustryWebsiteContent(
      {
        testimonials: [],
        trustBadges: parsed.trustBadges,
        headline: defaults.headline,
        subheadline: defaults.subheadline,
      },
      pack,
      profile,
    );
    return Response.json({
      success: true,
      data: {
        testimonials: [],
        trustBadges: content.trustBadges,
      },
    });
  }

  content = personalizeGeneratedContent(parsed, pack, profile);

  return Response.json({
    success: true,
    data: {
      ...content,
      testimonials: [],
      themeColor: pack.defaultThemeColor,
    },
  });
}
