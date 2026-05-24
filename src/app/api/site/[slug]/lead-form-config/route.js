import { getPublicWebsiteBySlug } from "@/lib/public-website";
import {
  LEAD_BUDGET_OPTIONS,
  LEAD_CONTACT_PREFERENCES,
  LEAD_TIMELINE_OPTIONS,
  resolveWebsiteRequestServices,
} from "@/lib/website-lead-form";

export async function GET(_request, { params }) {
  const { slug } = await params;
  const data = await getPublicWebsiteBySlug(slug);

  if (!data) {
    return Response.json({ success: false, error: "Website not found" }, { status: 404 });
  }

  const services = resolveWebsiteRequestServices(data);
  const companyName =
    data.companyProfile?.publicDisplayName ||
    data.companyProfile?.companyName ||
    "Our team";

  return Response.json({
    success: true,
    data: {
      slug: data.slug,
      companyName,
      industryLabel: data.industryLabel || "",
      themeColor: data.themeColor || "#1d4ed8",
      services,
      budgetOptions: LEAD_BUDGET_OPTIONS,
      timelineOptions: LEAD_TIMELINE_OPTIONS,
      contactPreferences: LEAD_CONTACT_PREFERENCES,
      locale: data.companyProfile?.documentLanguage === "es" ? "es" : "en",
      phone: data.companyProfile?.phone || "",
    },
  });
}
