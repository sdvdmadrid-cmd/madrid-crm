import { supabaseAdmin } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import RequestServiceForm from "@/components/site/RequestServiceForm";
import { getIndustryProfile } from "@/lib/industry-profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data } = await supabaseAdmin
    .from("contractor_websites")
    .select("headline, subheadline")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!data) return { title: "Contractor" };

  return {
    title: data.headline || "Contractor",
    description: data.subheadline || "",
  };
}

export default async function PublicContractorSitePage({ params }) {
  const { slug } = await params;

  const { data } = await supabaseAdmin
    .from("contractor_websites")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!data) notFound();

  const theme = data.theme_color || "#16a34a";
  const headline = data.headline || "";
  const subheadline = data.subheadline || "";
  const aboutText = data.about_text || "";
  const ctaText = data.cta_text || "Get a Free Quote";

  // Fetch company profile for contact details
  const { data: tenantProfile } = await supabaseAdmin
    .from("company_profiles")
    .select("company_name, phone, business_address, logo_data_url, business_type")
    .eq("tenant_id", data.tenant_id)
    .maybeSingle();

  const companyName = tenantProfile?.company_name || "";
  const phone = tenantProfile?.phone || "";
  const address = tenantProfile?.business_address || "";
  const logoUrl = tenantProfile?.logo_data_url || "";
  const industryProfile = getIndustryProfile(tenantProfile?.business_type || "");
  const services =
    Array.isArray(data.services) && data.services.length > 0
      ? data.services
      : (industryProfile.websiteServices || []).map((name) => ({
          name,
          description: "",
          price: "",
        }));

  const galleryItems = services.slice(0, 6).map((service, index) => ({
    title: service.name || `Project ${index + 1}`,
    subtitle: service.description || "Recent completed service project.",
  }));

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; }
        .site-nav { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.96); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(0,0,0,0.08); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .site-logo { font-weight: 800; font-size: 18px; color: #0f172a; letter-spacing: -0.4px; display: flex; align-items: center; gap: 10px; }
        .site-logo img { height: 36px; width: 36px; object-fit: contain; border-radius: 6px; }
        .site-links { display: flex; align-items: center; gap: 14px; font-size: 13px; }
        .site-links a { color: #334155; text-decoration: none; font-weight: 600; }
        .site-links a:hover { color: var(--theme); }
        .site-cta-nav { background: var(--theme); color: #fff; border: none; border-radius: 999px; padding: 10px 22px; font-weight: 700; font-size: 15px; cursor: pointer; text-decoration: none; }
        .hero { background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, var(--theme-dark) 100%); color: #fff; padding: 100px 24px 80px; text-align: center; position: relative; overflow: hidden; }
        .hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 30% 40%, color-mix(in srgb, var(--theme) 25%, transparent), transparent 60%), radial-gradient(circle at 70% 80%, color-mix(in srgb, var(--theme) 15%, transparent), transparent 50%); }
        .hero-inner { position: relative; max-width: 760px; margin: 0 auto; }
        .hero h1 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 900; letter-spacing: -1.5px; line-height: 1.1; margin-bottom: 20px; }
        .hero p { font-size: clamp(1rem, 2vw, 1.25rem); opacity: 0.85; max-width: 560px; margin: 0 auto 36px; line-height: 1.6; }
        .hero-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
        .btn-primary { background: var(--theme); color: #fff; border: none; border-radius: 999px; padding: 16px 34px; font-weight: 800; font-size: 17px; cursor: pointer; text-decoration: none; transition: filter 0.18s; }
        .btn-primary:hover { filter: brightness(1.12); }
        .btn-secondary { background: transparent; color: #fff; border: 2px solid rgba(255,255,255,0.5); border-radius: 999px; padding: 14px 28px; font-weight: 700; font-size: 16px; cursor: pointer; text-decoration: none; transition: border-color 0.18s; }
        .btn-secondary:hover { border-color: rgba(255,255,255,0.9); }
        .section { padding: 80px 24px; max-width: 1100px; margin: 0 auto; }
        .section-title { font-size: clamp(1.6rem, 3vw, 2.4rem); font-weight: 800; letter-spacing: -0.8px; margin-bottom: 12px; color: #0f172a; }
        .section-sub { color: #64748b; font-size: 17px; margin-bottom: 48px; }
        .services-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
        .service-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px 24px; transition: box-shadow 0.2s, transform 0.2s; }
        .service-card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.1); transform: translateY(-2px); }
        .service-icon { width: 44px; height: 44px; border-radius: 12px; background: color-mix(in srgb, var(--theme) 12%, white); display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 14px; }
        .service-name { font-weight: 700; font-size: 17px; margin-bottom: 6px; color: #0f172a; }
        .service-desc { color: #64748b; font-size: 14px; line-height: 1.6; }
        .about-section { background: #f1f5f9; }
        .about-inner { max-width: 780px; }
        .about-inner p { font-size: 18px; line-height: 1.75; color: #334155; }
        .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
        .gallery-card { border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; background: #fff; }
        .gallery-thumb { height: 140px; background: linear-gradient(140deg, color-mix(in srgb, var(--theme) 18%, #f8fafc), #e2e8f0); display: grid; place-items: center; color: #334155; font-size: 28px; }
        .gallery-copy { padding: 14px; }
        .gallery-copy strong { display: block; margin-bottom: 6px; color: #0f172a; font-size: 15px; }
        .gallery-copy span { color: #64748b; font-size: 13px; line-height: 1.5; }
        .contact-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px; margin-top: 20px; color: #334155; }
        .contact-card h3 { margin-bottom: 10px; font-size: 20px; color: #0f172a; }
        .cta-section { background: linear-gradient(135deg, var(--theme-dark) 0%, var(--theme) 100%); color: #fff; text-align: center; padding: 80px 24px; }
        .cta-section h2 { font-size: clamp(1.8rem, 3.5vw, 3rem); font-weight: 900; letter-spacing: -1px; margin-bottom: 16px; }
        .cta-section p { font-size: 18px; opacity: 0.85; margin-bottom: 36px; }
        .cta-phone { font-size: 32px; font-weight: 900; letter-spacing: -1px; color: #fff; text-decoration: none; display: block; margin-bottom: 28px; }
        .cta-phone:hover { opacity: 0.9; }
        footer { background: #0f172a; color: rgba(255,255,255,0.55); text-align: center; padding: 28px 24px; font-size: 14px; }
        footer a { color: rgba(255,255,255,0.7); text-decoration: none; }
        @media (max-width: 600px) {
          .site-nav { padding: 12px 16px; }
          .site-links { display: none; }
          .hero { padding: 70px 16px 60px; }
          .section { padding: 60px 16px; }
          .services-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div style={{ "--theme": theme, "--theme-dark": `color-mix(in srgb, ${theme} 70%, #0f172a)` }}>
        {/* Nav */}
        <nav className="site-nav">
          <div className="site-logo">
            {logoUrl && <img src={logoUrl} alt={companyName} />}
            <span>{companyName}</span>
          </div>
          <div className="site-links">
            <a href="#home">Home</a>
            <a href="#services">Services</a>
            <a href="#about">About</a>
            <a href="#gallery">Gallery</a>
            <a href="#contact">Contact</a>
            <a href="#request-service">Request Service</a>
          </div>
          {phone && (
            <a href={`tel:${phone}`} className="site-cta-nav">
              {phone}
            </a>
          )}
        </nav>

        {/* Hero */}
        <section className="hero" id="home">
          <div className="hero-inner">
            <h1>{headline}</h1>
            <p>{subheadline}</p>
            <div className="hero-btns">
              <a href="#contact" className="btn-primary">{ctaText}</a>
              {services.length > 0 && (
                <a href="#services" className="btn-secondary">View Services</a>
              )}
            </div>
          </div>
        </section>

        {/* Services */}
        {services.length > 0 && (
          <div id="services">
            <div className="section">
              <h2 className="section-title">Our Services</h2>
              <p className="section-sub">Professional work delivered with quality and care.</p>
              <div className="services-grid">
                {services.map((service, i) => (
                  <div key={i} className="service-card">
                    <div className="service-icon">
                      {["🌿", "🔨", "🏗️", "🏠", "🌲", "🧱", "💧", "⚙️"][i % 8]}
                    </div>
                    <div className="service-name">{service.name}</div>
                    {service.description && (
                      <div className="service-desc">{service.description}</div>
                    )}
                    {service.price && (
                      <div style={{ marginTop: 10, fontWeight: 700, color: theme, fontSize: 15 }}>
                        {service.price}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* About */}
        {aboutText && (
          <div className="about-section" id="about">
            <div className="section">
              <div className="about-inner">
                <h2 className="section-title">About Us</h2>
                <p>{aboutText}</p>
              </div>
            </div>
          </div>
        )}

        {/* Gallery */}
        <div id="gallery" className="section">
          <h2 className="section-title">Gallery</h2>
          <p className="section-sub">Selected project snapshots from our recent work.</p>
          <div className="gallery-grid">
            {galleryItems.map((item, index) => (
              <article key={`${item.title}-${index}`} className="gallery-card">
                <div className="gallery-thumb">{["🏡", "🧰", "🛠️", "📐", "✅", "📸"][index % 6]}</div>
                <div className="gallery-copy">
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Contact details */}
        <div id="contact" className="section">
          <h2 className="section-title">Contact</h2>
          <p className="section-sub">Reach out directly and we&apos;ll help plan your service.</p>
          <div className="contact-card">
            <h3>{companyName}</h3>
            {phone && <p><strong>Phone:</strong> <a href={`tel:${phone}`}>{phone}</a></p>}
            {address && <p><strong>Address:</strong> {address}</p>}
            <p><strong>Industry:</strong> {industryProfile.label}</p>
          </div>
        </div>

        {/* CTA / Contact */}
        <section id="request-service" className="cta-section">
          <h2>Request Service</h2>
          <p style={{ marginBottom: 40, marginTop: 0 }}>Tell us what you need. We&apos;ll create your lead, follow up, and prepare your estimate.</p>
          <RequestServiceForm
            slug={data.slug}
            serviceOptions={industryProfile.requestServiceOptions || []}
          />
          {phone && (
            <p style={{ marginTop: 28, opacity: 0.7, fontSize: 14 }}>
              Prefer to call? <a href={`tel:${phone}`} style={{ color: "#fff", fontWeight: 600, textDecoration: "underline" }}>{phone}</a>
            </p>
          )}
        </section>

        <footer>
          <p>
            &copy; {new Date().getFullYear()} {companyName}.{" "}
            Powered by{" "}
            <a href="https://fieldbaseapp.net" rel="noopener noreferrer">
              FieldBase
            </a>
          </p>
        </footer>
      </div>
    </>
  );
}
