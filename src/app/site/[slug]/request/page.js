import { notFound } from "next/navigation";
import Link from "next/link";
import RequestServiceForm from "@/components/site/RequestServiceForm";
import { getPublicWebsiteBySlug } from "@/lib/public-website";

export const dynamic = "force-dynamic";

function normalizeRequestedService(rawValue, options) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  return options.includes(value) ? value : "";
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getPublicWebsiteBySlug(slug);

  return {
    title: data?.headline ? `Request Service | ${data.headline}` : "Request Service",
    description: "Request a quote and send your project details.",
  };
}

export default async function PublicContractorRequestPage({ params, searchParams }) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  const data = await getPublicWebsiteBySlug(slug);

  if (!data) notFound();

  const companyName =
    data.companyProfile?.publicDisplayName || data.companyProfile?.companyName || "Contractor";
  // Forzar una lista amplia de servicios para el select
  const serviceOptions = [
    "Interior Painting",
    "Exterior Painting",
    "Roof Inspection",
    "Leak Repair",
    "Shingle Repair",
    "Full Roof Replacement",
    "Lawn Maintenance",
    "Mulch / Rock",
    "Irrigation",
    "Hardscape Install",
    "Yard Cleanup",
    "Deep Cleaning",
    "Recurring Cleaning",
    "Move-In / Move-Out",
    "Post-Construction Cleaning",
    "Panel Upgrade",
    "Wiring Repair",
    "Lighting Install",
    "Outlet / Switch",
    "Plumbing Repair",
    "Water Heater",
    "Fixture Install",
    "AC Repair",
    "Heating Repair",
    "Ductwork",
    "General Handyman",
    "Other"
  ];
  const initialService = normalizeRequestedService(
    resolvedSearchParams?.service,
    serviceOptions,
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0f172a 0%, #1e293b 38%, #f8fafc 38%, #f8fafc 100%)",
        padding: "32px 16px 72px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 28,
          }}
        >
          <div>
            <p style={{ color: "#93c5fd", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              CLIENT REQUEST INTAKE
            </p>
            <h1 style={{ color: "#ffffff", fontSize: "clamp(2rem, 4vw, 3.25rem)", fontWeight: 900, letterSpacing: -1.5, marginBottom: 10 }}>
              Request a Quote from {companyName}
            </h1>
            <p style={{ color: "#cbd5e1", maxWidth: 620, lineHeight: 1.7, fontSize: 16 }}>
              Enter your contact information, location, and the type of work you need.
              The contractor receives your request and can follow up quickly.
            </p>
          </div>

          <Link
            href={`/site/${slug}`}
            style={{
              color: "#ffffff",
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 999,
              padding: "10px 16px",
              fontWeight: 700,
            }}
          >
            Back to Site
          </Link>
        </div>

        <section
          style={{
            background: "#1e293b",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 24,
            padding: 24,
            marginBottom: 28,
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 18 }}>
            <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Service Type</p>
            <p style={{ color: "#ffffff", fontSize: 18, fontWeight: 800 }}>
              {initialService || "Choose the job category"}
            </p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 18 }}>
            <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Response Promise</p>
            <p style={{ color: "#ffffff", fontSize: 18, fontWeight: 800 }}>Same-day follow-up</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 18 }}>
            <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Submission</p>
            <p style={{ color: "#ffffff", fontSize: 18, fontWeight: 800 }}>No obligation quote request</p>
          </div>
        </section>

        <section
          style={{
            background: "#1e293b",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 24,
            padding: "28px 20px",
            boxShadow: "0 30px 80px rgba(15, 23, 42, 0.28)",
          }}
        >
          <RequestServiceForm
            slug={slug}
            serviceOptions={serviceOptions}
            initialService={initialService}
          />
        </section>
      </div>
    </main>
  );
}
