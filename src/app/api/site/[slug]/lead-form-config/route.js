import { publicWebsiteJson } from "@/lib/api-zone-guard";
import { resolveWebsiteForLeadSubmission } from "@/lib/public-website-lead";
import { getTurnstileSiteKey, getTurnstileStatus } from "@/lib/turnstile";
import {
  LEAD_BUDGET_OPTIONS,
  LEAD_CONTACT_PREFERENCES,
  LEAD_TIMELINE_OPTIONS,
  resolveWebsiteRequestServices,
} from "@/lib/website-lead-form";

export async function GET(_request, { params }) {
  const { slug } = await params;
  const resolved = await resolveWebsiteForLeadSubmission(slug);

  if (!resolved.ok) {
    return publicWebsiteJson(
      {
        success: false,
        error: resolved.message,
        code: resolved.reason,
      },
      { status: resolved.status },
    );
  }

  const data = resolved.website;
  const turnstile = getTurnstileStatus();

  const services = resolveWebsiteRequestServices(data);
  const companyName =
    data.companyProfile?.publicDisplayName ||
    data.companyProfile?.companyName ||
    "Our team";

  return publicWebsiteJson({
    success: true,
    data: {
      slug: resolved.slug,
      companyName,
      industryLabel: data.industryLabel || "",
      themeColor: data.themeColor || "#1d4ed8",
      services,
      budgetOptions: LEAD_BUDGET_OPTIONS,
      timelineOptions: LEAD_TIMELINE_OPTIONS,
      contactPreferences: LEAD_CONTACT_PREFERENCES,
      locale: data.companyProfile?.documentLanguage === "es" ? "es" : "en",
      phone: data.companyProfile?.phone || "",
      turnstile: {
        required: turnstile.verificationRequired,
        mode: turnstile.mode,
        siteKey: turnstile.widgetEnabled ? getTurnstileSiteKey() : "",
      },
    },
  });
}
