import { notFound } from "next/navigation";
import Link from "next/link";
import PublicSiteFooter from "@/components/site/PublicSiteFooter";
import PublicSiteNav from "@/components/site/PublicSiteNav";
import RequestServiceForm from "@/components/site/RequestServiceForm";
import { buildPublicSiteMetadata } from "@/lib/public-website-seo";
import { getPublicWebsiteBySlug } from "@/lib/public-website";
import { fillPublicSiteTemplate, getPublicSiteCopy, resolvePublicSiteLocale } from "@/lib/public-site-copy";
import { getWebsiteBuilderPack, resolveWebsiteIndustryKey } from "@/lib/website-builder-industry";

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
  const pack = getWebsiteBuilderPack(
    resolveWebsiteIndustryKey(data.companyProfile?.businessType),
  );
  const serviceOptions =
    Array.isArray(data.requestServices) && data.requestServices.length > 0
      ? data.requestServices
      : pack.requestServices;
  const initialService = normalizeRequestedService(
    resolvedSearchParams?.service,
    serviceOptions,
  );
  const theme = data.themeColor || "#1d4ed8";
  const phone = data.companyProfile?.phone || "";

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <PublicSiteNav
        slug={slug}
        companyName={companyName}
        logoUrl={data.companyProfile?.logoDataUrl || ""}
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
            href={`/site/${slug}`}
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
          style={{
            background: "#1e293b",
            borderRadius: 20,
            padding: "28px 20px",
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
            marginBottom: 0,
          }}
        >
          <RequestServiceForm
            slug={slug}
            serviceOptions={serviceOptions}
            initialService={initialService}
            locale={locale}
            requireEmail
          />
        </section>
      </div>

      <PublicSiteFooter
        slug={slug}
        companyName={companyName}
        phone={phone}
        businessAddress={data.companyProfile?.businessAddress || ""}
        socialLinks={data.socialLinks || {}}
        googleReviewsUrl={data.companyProfile?.googleReviewsUrl || ""}
        themeColor={theme}
        locale={locale}
      />
    </main>
  );
}
