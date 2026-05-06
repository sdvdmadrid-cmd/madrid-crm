import { supabaseAdmin } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import RequestServiceForm from "@/components/site/RequestServiceForm";
import { getIndustryProfile } from "@/lib/industry-profiles";

export const dynamic = "force-dynamic";

// ─── Service SVG Icons (same blue-box style as landing) ────────────────
const SERVICE_ICON_PATHS = [
  // tools / wrench
  "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  // star
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  // home
  "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  // leaf
  "M17 8C8 10 5.9 16.17 3.82 22 7 22 9.5 20.5 12 17c3-4 5-7 13-4-1-6-5-9-8-5z",
  // credit card
  "M3 9h18 M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M7 15h.01M11 15h2",
  // check-circle
  "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
];

function ServiceIcon({ index }) {
  const path = SERVICE_ICON_PATHS[index % SERVICE_ICON_PATHS.length];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 24, height: 24 }}
    >
      {path.split(" M").map((d, i) => (
        <path key={i} d={i === 0 ? d : "M" + d} />
      ))}
    </svg>
  );
}

// ─── Contractor social proof stats ────────────────────────────────────
const CONTRACTOR_STATS = [
  { number: "Free Quote", label: "No obligation estimate" },
  { number: "Licensed", label: "Fully licensed & insured" },
  { number: "5★", label: "Top-rated local contractor" },
  { number: "Same Day", label: "Response within hours" },
];

// ─── Hero background photos ───────────────────────────────────────────
const HERO_PHOTOS = [
  { src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&h=280&fit=crop", alt: "Professional contractor at work" },
  { src: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=280&fit=crop", alt: "Expert service team" },
  { src: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=280&fit=crop", alt: "Outdoor project completed" },
  { src: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=280&fit=crop", alt: "Construction professionals" },
  { src: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400&h=280&fit=crop", alt: "Skilled tradespeople" },
  { src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=280&fit=crop", alt: "Home services professional" },
];

// ─── Wave divider (same as landing) ───────────────────────────────────
function WaveDivider({ fromColor, toColor }) {
  return (
    <div style={{ height: 60, background: toColor, overflow: "hidden", position: "relative" }}>
      <svg
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <path d="M0 0 Q300 60 600 30 Q900 0 1200 40 L1200 0 Z" fill={fromColor} />
      </svg>
    </div>
  );
}

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

  const theme = data.theme_color || "#1d4ed8";
  const headline = data.headline || "";
  const subheadline = data.subheadline || "";
  const aboutText = data.about_text || "";
  const ctaText = data.cta_text || "Start Free - 30 Days";

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

  // Pad services to at least 3, max 6
  const displayServices = services.slice(0, 6);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; }

        /* ── Navbar (identical to landing) ── */
        .s-nav { position: sticky; top: 0; z-index: 100; background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; gap: 12px; }
        .s-logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 20px; color: #fff; letter-spacing: -0.5px; text-decoration: none; }
        .s-logo-icon { width: 32px; height: 32px; border-radius: 6px; background: var(--theme); display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
        .s-logo-icon img { width: 100%; height: 100%; object-fit: contain; }
        .s-nav-links { display: flex; align-items: center; gap: 24px; font-size: 14px; }
        .s-nav-links a { color: #94a3b8; text-decoration: none; font-weight: 600; transition: color 0.15s; }
        .s-nav-links a:hover { color: #fff; }
        .s-nav-cta { background: var(--theme); color: #fff !important; padding: 8px 20px; border-radius: 6px; font-weight: 700; font-size: 14px; text-decoration: none; white-space: nowrap; }
        .s-nav-cta:hover { filter: brightness(1.1); }

        /* ── Hero (identical to landing) ── */
        .s-hero { background: #1e293b; color: #fff; padding: 64px 24px 0; }
        .s-hero-inner { max-width: 1280px; margin: 0 auto; display: flex; align-items: flex-start; gap: 64px; }
        .s-hero-left { flex: 1; padding-bottom: 48px; }
        .s-hero-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(29,78,216,0.2); color: #93c5fd; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700; margin-bottom: 20px; }
        .s-hero h1 { font-size: clamp(2.2rem, 5vw, 3.75rem); font-weight: 900; line-height: 1.1; letter-spacing: -2px; margin-bottom: 24px; }
        .s-hero-sub { font-size: 18px; color: #94a3b8; line-height: 1.65; max-width: 480px; margin-bottom: 16px; }
        .s-hero-pill { display: inline-block; background: rgba(29,78,216,0.15); color: #93c5fd; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; margin-bottom: 32px; }
        .s-hero-btns { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 32px; }
        .s-btn-primary { background: var(--theme); color: #fff; padding: 14px 32px; border-radius: 6px; font-weight: 800; font-size: 16px; text-decoration: none; transition: filter 0.18s; }
        .s-btn-primary:hover { filter: brightness(1.12); }
        .s-btn-secondary { background: rgba(255,255,255,0.1); color: #fff; padding: 14px 28px; border-radius: 6px; font-weight: 700; font-size: 16px; text-decoration: none; transition: background 0.18s; }
        .s-btn-secondary:hover { background: rgba(255,255,255,0.2); }
        .s-hero-proof { display: flex; gap: 24px; flex-wrap: wrap; }
        .s-proof-item { display: flex; align-items: center; gap: 8px; }
        .s-proof-item .s-p-num { font-weight: 700; font-size: 15px; color: #fff; }
        .s-proof-item .s-p-label { font-size: 13px; color: #64748b; }
        .s-hero-right { flex: 1; max-width: 580px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-bottom: 0; min-width: 0; }
        .s-hero-photo { position: relative; padding-bottom: 65%; border-radius: 12px; overflow: hidden; }
        .s-hero-photo-caption { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 10px; background: linear-gradient(to top, rgba(0,0,0,0.7), transparent); color: #fff; font-size: 11px; font-weight: 600; }

        /* ── Stats bar (identical to landing) ── */
        .s-stats { background: #1e293b; padding: 24px 24px 56px; }
        .s-stats-grid { max-width: 1280px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .s-stat-tile { background: #1e3a5f; border-radius: 12px; padding: 20px; text-align: center; }
        .s-stat-num { font-size: 2rem; font-weight: 900; color: #fff; margin-bottom: 4px; }
        .s-stat-label { font-size: 13px; color: #64748b; }

        /* ── Features / Services grid (identical to landing) ── */
        .s-features { background: #fff; padding: 80px 24px; }
        .s-features-inner { max-width: 1200px; margin: 0 auto; }
        .s-section-eyebrow { text-align: center; font-size: clamp(1.8rem, 3.5vw, 2.75rem); font-weight: 900; color: #1e293b; letter-spacing: -1px; margin-bottom: 14px; }
        .s-section-sub { text-align: center; font-size: 17px; color: #6b7280; max-width: 560px; margin: 0 auto 56px; }
        .s-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
        .s-feature-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px 24px; display: flex; flex-direction: column; transition: box-shadow 0.2s, transform 0.2s; }
        .s-feature-card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.08); transform: translateY(-2px); }
        .s-feature-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
        .s-feature-icon { width: 48px; height: 48px; border-radius: 10px; background: var(--theme); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .s-feature-badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; }
        .s-feature-title { font-size: 17px; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
        .s-feature-desc { font-size: 14px; color: #6b7280; line-height: 1.65; flex: 1; }
        .s-feature-price { margin-top: 14px; font-weight: 700; color: var(--theme); font-size: 15px; }
        .s-feature-cta { margin-top: 16px; font-weight: 700; font-size: 14px; color: var(--theme); text-decoration: none; }
        .s-feature-cta:hover { text-decoration: underline; }

        /* ── About (identical to landing's eff6ff bg sections) ── */
        .s-about { background: #eff6ff; padding: 80px 24px; }
        .s-about-inner { max-width: 800px; }
        .s-about-inner p { font-size: 18px; line-height: 1.8; color: #334155; }

        /* ── Testimonials (identical to landing) ── */
        .s-testimonials { background: #eff6ff; padding: 16px 24px 80px; }
        .s-test-grid { max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        .s-test-card { background: #fff; border-radius: 20px; padding: 36px 32px; box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
        .s-test-quote { font-size: 17px; font-weight: 500; color: #1e293b; line-height: 1.6; margin-bottom: 24px; }
        .s-test-author { display: flex; align-items: center; gap: 12px; }
        .s-test-avatar { width: 40px; height: 40px; border-radius: 999px; background: #1e293b; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; }
        .s-test-name { font-weight: 700; font-size: 14px; color: #1e293b; }
        .s-test-co { font-size: 12px; color: #6b7280; }

        /* ── Dark CTA / Pricing (identical to landing) ── */
        .s-cta { background: #1e293b; padding: 80px 24px; text-align: center; }
        .s-cta-inner { max-width: 640px; margin: 0 auto; }
        .s-cta h2 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 900; color: #fff; letter-spacing: -1.5px; margin-bottom: 20px; }
        .s-cta-sub { font-size: 18px; color: #94a3b8; margin-bottom: 12px; }
        .s-cta-phone { font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 900; color: #fff; text-decoration: none; letter-spacing: -1px; display: block; margin-bottom: 36px; }
        .s-cta-phone:hover { opacity: 0.88; }

        /* ── Footer ── */
        .s-footer { background: #0f172a; color: rgba(255,255,255,0.5); text-align: center; padding: 28px 24px; font-size: 14px; }
        .s-footer a { color: rgba(255,255,255,0.7); text-decoration: none; }
        .s-footer a:hover { color: #fff; }

        /* ── Contact row ── */
        .s-contact-row { max-width: 1200px; margin: 0 auto; display: flex; gap: 16px; flex-wrap: wrap; }
        .s-contact-chip { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 12px 20px; color: #94a3b8; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .s-contact-chip strong { color: #fff; }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .s-hero-inner { flex-direction: column; gap: 32px; }
          .s-hero-right { max-width: 100%; width: 100%; }
          .s-features-grid { grid-template-columns: 1fr 1fr; }
          .s-stats-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 600px) {
          .s-nav-links { display: none; }
          .s-hero { padding: 56px 16px 0; }
          .s-features-grid { grid-template-columns: 1fr; }
          .s-test-grid { grid-template-columns: 1fr; }
          .s-stats-grid { grid-template-columns: 1fr 1fr; }
          .s-cta { padding: 64px 16px; }
        }
      `}</style>

      <div style={{ "--theme": theme }}>
        {/* ── Navbar ── */}
        <nav className="s-nav">
          <a href="#home" className="s-logo">
            <div className="s-logo-icon">
              {logoUrl
                ? <img src={logoUrl} alt={companyName} />
                : <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M9 22V12h6v10" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
              }
            </div>
            {companyName}
          </a>
          <div className="s-nav-links">
            <a href="#services">Services</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </div>
          {phone
            ? <a href={`tel:${phone}`} className="s-nav-cta">{phone}</a>
            : <a href="#request-service" className="s-nav-cta">Get a Quote</a>
          }
        </nav>

        {/* ── Hero ── */}
        <section className="s-hero" id="home">
          <div className="s-hero-inner">
            <div className="s-hero-left">
              <div className="s-hero-badge">
                ⭐ {industryProfile.label} · Licensed &amp; Insured
              </div>
              <h1>{headline || `Professional ${industryProfile.label}`}</h1>
              <p className="s-hero-sub">{subheadline || `Quality ${industryProfile.label.toLowerCase()} services you can count on. Licensed, insured, and trusted by local homeowners and businesses.`}</p>
              <p className="s-hero-pill">🎉 Free estimates — no obligation, same-day response</p>
              <div className="s-hero-btns">
                <a href="#request-service" className="s-btn-primary">{ctaText || "Get a Free Quote"}</a>
                <a href="#services" className="s-btn-secondary">Our Services</a>
              </div>
              <div className="s-hero-proof">
                <div className="s-proof-item">
                  <span className="s-p-num">📱 4.8 ★★★★★</span>
                  <span className="s-p-label">App Store</span>
                </div>
                <div className="s-proof-item">
                  <span className="s-p-num">▶️ 4.5 ★★★★½</span>
                  <span className="s-p-label">Google Play</span>
                </div>
              </div>
            </div>
            <div className="s-hero-right">
              {HERO_PHOTOS.map((photo, i) => (
                <div key={i} className="s-hero-photo">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    style={{ objectFit: "cover" }}
                    unoptimized
                  />
                  <div className="s-hero-photo-caption">{photo.alt}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stats bar ── */}
        <section className="s-stats">
          <div className="s-stats-grid">
            {CONTRACTOR_STATS.map((stat) => (
              <div key={stat.number} className="s-stat-tile">
                <div className="s-stat-num">{stat.number}</div>
                <div className="s-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <WaveDivider fromColor="#1e293b" toColor="#ffffff" />

        {/* ── Services / Features grid (landing card style) ── */}
        {displayServices.length > 0 && (
          <section className="s-features" id="services">
            <div className="s-features-inner">
              <h2 className="s-section-eyebrow">Our Services</h2>
              <p className="s-section-sub">
                Everything you need — from initial quote to completed project.
              </p>
              <div className="s-features-grid">
                {displayServices.map((service, i) => (
                  <div key={i} className="s-feature-card">
                    <div className="s-feature-top">
                      <div className="s-feature-icon">
                        <ServiceIcon index={i} />
                      </div>
                      {service.price && (
                        <span className="s-feature-badge">{service.price}</span>
                      )}
                    </div>
                    <div className="s-feature-title">{service.name}</div>
                    {service.description && (
                      <div className="s-feature-desc">{service.description}</div>
                    )}
                    <a href="#request-service" className="s-feature-cta">Get a quote →</a>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <WaveDivider fromColor="#ffffff" toColor="#eff6ff" />

        {/* ── About ── */}
        {aboutText && (
          <section className="s-about" id="about">
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div className="s-about-inner">
                <h2 style={{ fontSize: "clamp(1.8rem,3.5vw,2.5rem)", fontWeight: 900, color: "#1e293b", letterSpacing: "-1px", marginBottom: 20 }}>
                  About {companyName}
                </h2>
                <p>{aboutText}</p>
                {(phone || address) && (
                  <div style={{ marginTop: 28, display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {phone && (
                      <a href={`tel:${phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1e293b", color: "#fff", padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
                        📞 {phone}
                      </a>
                    )}
                    {address && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#475569", fontSize: 15 }}>
                        📍 {address}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Testimonials (always shown, generic if no custom) ── */}
        <section className="s-testimonials">
          <div className="s-test-grid">
            <div className="s-test-card">
              <p className="s-test-quote">&ldquo;They were on time, professional, and did exactly what they promised. I highly recommend their services to anyone in the area.&rdquo;</p>
              <div className="s-test-author">
                <div className="s-test-avatar">J</div>
                <div>
                  <div className="s-test-name">James R.</div>
                  <div className="s-test-co">Local homeowner</div>
                </div>
              </div>
            </div>
            <div className="s-test-card">
              <p className="s-test-quote">&ldquo;Fair pricing, great communication, and the results exceeded my expectations. This is our go-to company for all future projects.&rdquo;</p>
              <div className="s-test-author">
                <div className="s-test-avatar">M</div>
                <div>
                  <div className="s-test-name">Maria L.</div>
                  <div className="s-test-co">Repeat customer</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <WaveDivider fromColor="#eff6ff" toColor="#1e293b" />

        {/* ── CTA / Request Service (dark, like landing's pricing section) ── */}
        <section className="s-cta" id="request-service">
          <div className="s-cta-inner">
            <h2>
              {phone ? "Call us today." : "Get your free quote."}
              <br />
              We respond fast.
            </h2>
            <p className="s-cta-sub">No obligation. Free estimate. Same-day response.</p>
            {phone && (
              <a href={`tel:${phone}`} className="s-cta-phone">
                {phone}
              </a>
            )}
            <RequestServiceForm
              slug={data.slug}
              serviceOptions={industryProfile.requestServiceOptions || []}
            />
          </div>

          {/* Contact details row */}
          <div id="contact" style={{ marginTop: 48 }}>
            <div className="s-contact-row" style={{ justifyContent: "center" }}>
              {phone && (
                <div className="s-contact-chip">
                  <span>📞</span>
                  <span><strong>{phone}</strong></span>
                </div>
              )}
              {address && (
                <div className="s-contact-chip">
                  <span>📍</span>
                  <span>{address}</span>
                </div>
              )}
              <div className="s-contact-chip">
                <span>🏷️</span>
                <span>{industryProfile.label}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="s-footer">
          <p>
            &copy; {new Date().getFullYear()} <strong style={{ color: "rgba(255,255,255,0.7)" }}>{companyName}</strong>.{" "}
            Powered by{" "}
            <a href="https://fieldbaseapp.net" target="_blank" rel="noopener noreferrer">
              FieldBase
            </a>
          </p>
        </footer>
      </div>
    </>
  );
}
