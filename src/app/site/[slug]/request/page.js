import { notFound } from "next/navigation";
import Link from "next/link";
import PublicSiteFooter from "@/components/site/PublicSiteFooter";
import PublicSiteNav from "@/components/site/PublicSiteNav";
import RequestServiceForm from "@/components/site/RequestServiceForm";
import PublicSiteEnhancements from "@/components/site/PublicSiteEnhancements";
import PublicSiteLeadExperience from "@/components/site/PublicSiteLeadExperience";
import { resolveCompanyLogoUrl } from "@/lib/resolve-company-logo-url";
import { resolveWebsiteRequestServices } from "@/lib/website-lead-form";
import { buildPublicSiteMetadata } from "@/lib/public-website-seo";
import { getPublicWebsiteBySlug } from "@/lib/public-website";
import { fillPublicSiteTemplate, getPublicSiteCopy, resolvePublicSiteLocale } from "@/lib/public-site-copy";

export const revalidate = 120;

function normalizeRequestedService(rawValue, options) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  return options.includes(value) ? value : "";
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getPublicWebsiteBySlug(slug);

  if (!data) return { title: "Request Service" };

  return buildPublicSiteMetadata(data, { page: "request" });
}

export default async function PublicContractorRequestPage({ params, searchParams }) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const data = await getPublicWebsiteBySlug(slug);

  if (!data) notFound();

  const locale = resolvePublicSiteLocale(data.companyProfile?.documentLanguage);
  const copy = getPublicSiteCopy(locale);

  const companyName =
    data.companyProfile?.publicDisplayName || data.companyProfile?.companyName || "Contractor";
  const serviceOptions = resolveWebsiteRequestServices({
    services: data.services,
    requestServices: data.requestServices,
    industryKey: data.industryKey,
    businessType: data.companyProfile?.businessType || "",
  });
  const initialService = normalizeRequestedService(
    resolvedSearchParams?.service,
    serviceOptions,
  );
  const theme = data.themeColor || "#1d4ed8";
  const phone = data.companyProfile?.phone || "";
  const logoUrl =
    data.companyProfile?.resolvedLogoUrl ||
    resolveCompanyLogoUrl(data.companyProfile);

  const ctaText = data.ctaText || copy.nav.getQuote;

  return (
    <PublicSiteLeadExperience
      slug={data.slug}
      serviceOptions={serviceOptions}
      locale={locale}
      themeColor={theme}
      companyName={companyName}
    >
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)" }}>
      <PublicSiteEnhancements stickyCtaHref={`/sites/${data.slug}#request-service`} stickyCtaLabel={ctaText} />
      <PublicSiteNav
        slug={data.slug}
        companyName={companyName}
        logoUrl={logoUrl}
        phone={phone}
        ctaText={data.ctaText || copy.nav.getQuote}
        themeColor={theme}
        locale={locale}
      />

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 16px 0" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: "#64748b", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {copy.request.eyebrow}
          </p>
          <h1
            style={{
              color: "#0f172a",
              fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
              fontWeight: 900,
              letterSpacing: -1,
              marginBottom: 10,
            }}
          >
            {fillPublicSiteTemplate(copy.request.title, { company: companyName })}
          </h1>
          <p style={{ color: "#475569", maxWidth: 620, lineHeight: 1.7 }}>{copy.request.subtitle}</p>
          <Link
            href={`/sites/${data.slug}`}
            style={{
              display: "inline-block",
              marginTop: 14,
              color: theme,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {copy.request.back}
          </Link>
        </div>

        <section
          id="request-service"
          className="ps-visible"
          style={{
            background: "linear-gradient(145deg, #1e293b 0%, #0f172a 100%)",
            borderRadius: 24,
            padding: "clamp(20px, 4vw, 36px)",
            boxShadow: "0 32px 80px rgba(15, 23, 42, 0.22)",
            marginBottom: 0,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <RequestServiceForm
            slug={data.slug}
            serviceOptions={serviceOptions}
            initialService={initialService}
            locale={locale}
            requireEmail
            themeColor={theme}
          />
        </section>
      </div>

      <PublicSiteFooter
        slug={data.slug}
        companyName={companyName}
        logoUrl={logoUrl}
        phone={phone}
        businessAddress={data.companyProfile?.businessAddress || ""}
        socialLinks={data.socialLinks || {}}
        googleReviewsUrl={data.companyProfile?.googleReviewsUrl || ""}
        themeColor={theme}
        locale={locale}
      />
    </main>
    </PublicSiteLeadExperience>
  );
}
