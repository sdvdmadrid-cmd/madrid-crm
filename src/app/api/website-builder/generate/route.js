import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";
import { getIndustryProfile } from "@/lib/industry-profiles";

export async function POST(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return Response.json(
      { success: false, error: "OpenAI API key not configured." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const services = Array.isArray(body.services) ? body.services : [];

  const profile = await getCompanyProfileByTenant({
    tenantId: access.tenantDbId,
  });

  const companyName = profile.companyName || "Our Company";
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
  "ctaText": "Call to action button text (max 5 words, e.g. 'Get a Free Quote')",
  "services": [
    { "name": "Service name", "description": "1-2 sentence description" }
  ]
}
Include up to 8 of the most important services in the services array.
Write in first person plural (We/Our). Be professional and confident.
Return ONLY the JSON object. No markdown, no code blocks, no extra text.
`.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional copywriter specializing in contractor websites. Output only valid JSON as instructed.",
        },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message || `OpenAI error ${res.status}`;
    return Response.json({ success: false, error: message }, { status: 502 });
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content?.trim() || "{}";

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
      ctaText: String(parsed.ctaText || "Get a Free Quote").slice(0, 100),
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
