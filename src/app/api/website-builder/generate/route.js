import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { getIndustryProfile } from "@/lib/industry-profiles";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";
import { getRequestLanguage, runAiCompletion } from "@/lib/ai-service";

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

  const profile = await getCompanyProfileByTenant({
    tenantId: access.tenantDbId,
  });

  const companyName = profile.publicDisplayName || profile.companyName || "Our Company";
  const businessType = profile.businessType || "contractor";
  const industryProfile = getIndustryProfile(businessType);
  const phone = profile.phone || "";
  const address = profile.businessAddress || "";

  const topServices = services
    .slice(0, 12)
    .map((s) => `- ${s.name}${s.description ? `: ${s.description.slice(0, 80)}` : ""}`)
    .join("\n");

  const userPrompt = `
Company name: ${companyName}
Business type: ${businessType}
Phone: ${phone || "(not provided)"}
Address: ${address || "(not provided)"}

Services offered:
${topServices || "(no services listed yet)"}

Industry profile:
- Industry key: ${industryProfile.key}
- Industry label: ${industryProfile.label}
- Suggested services: ${(industryProfile.websiteServices || []).join(", ")}

Generate professional website content for this contractor. Return ONLY a valid JSON object with these exact keys:
{
  "headline": "Short punchy hero headline (max 10 words)",
  "subheadline": "Supporting sentence that builds trust and describes the business (max 25 words)",
  "aboutText": "2-3 sentence professional about paragraph (max 80 words)",
  "ctaText": "Call to action button text (max 5 words, e.g. 'Request Estimate')",
  "services": [
    { "name": "Service name", "description": "1-2 sentence description" }
  ]
}
Include up to 8 of the most important services in the services array.
Write in first person plural (We/Our). Be professional and confident.
Return ONLY the JSON object. No markdown, no code blocks, no extra text.
`.trim();

  let raw = "{}";
  try {
    const response = await runAiCompletion({
      request,
      tenantId: access.tenantDbId,
      userId: access.userId,
      feature: "website_builder_generate",
      modelTier: "mini",
      messages: [
        {
          role: "system",
          content:
            "You write concise contractor website copy. Return only valid JSON exactly as requested.",
        },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 720,
      temperature: 0.6,
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
    // Attempt to extract JSON from response if model added extra text
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

  return Response.json({
    success: true,
    data: {
      headline: String(parsed.headline || "").slice(0, 200),
      subheadline: String(parsed.subheadline || "").slice(0, 300),
      aboutText: String(parsed.aboutText || "").slice(0, 2000),
      ctaText: String(parsed.ctaText || "Request Estimate").slice(0, 100),
      services: Array.isArray(parsed.services)
        ? parsed.services.slice(0, 8).map((s) => ({
            name: String(s.name || "").slice(0, 100),
            description: String(s.description || "").slice(0, 400),
            price: "",
          }))
        : (industryProfile.websiteServices || []).slice(0, 8).map((name) => ({
            name,
            description: "",
            price: "",
          })),
    },
  });
}
