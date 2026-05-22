import Link from "next/link";

function mapsSearchUrl(address) {
  const q = String(address || "").trim();
  if (!q) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default function PublicSiteFooter({
  slug,
  companyName,
  phone,
  businessAddress,
  socialLinks = {},
  googleReviewsUrl = "",
  themeColor = "#1d4ed8",
}) {
  const year = new Date().getFullYear();
  const mapUrl = mapsSearchUrl(businessAddress);

  const socialItems = [
    { key: "facebook", label: "Facebook", href: socialLinks.facebook },
    { key: "instagram", label: "Instagram", href: socialLinks.instagram },
    { key: "yelp", label: "Yelp", href: socialLinks.yelp },
    { key: "tiktok", label: "TikTok", href: socialLinks.tiktok },
    { key: "linkedin", label: "LinkedIn", href: socialLinks.linkedin },
    { key: "google", label: "Google", href: socialLinks.google || googleReviewsUrl },
  ].filter((item) => String(item.href || "").startsWith("http"));

  return (
    <footer className="ps-footer">
      <div className="ps-footer-inner">
        <div className="ps-footer-grid">
          <div>
            <div className="ps-footer-brand" style={{ color: "#fff" }}>
              {companyName}
            </div>
            <p className="ps-footer-copy">
              Professional home services you can trust. Request a quote anytime.
            </p>
          </div>

          <div>
            <div className="ps-footer-heading">Contact</div>
            {phone ? (
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="ps-footer-link">
                {phone}
              </a>
            ) : null}
            {businessAddress ? (
              mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ps-footer-link"
                  style={{ display: "block", marginTop: 8 }}
                >
                  {businessAddress}
                </a>
              ) : (
                <p className="ps-footer-copy" style={{ marginTop: 8 }}>
                  {businessAddress}
                </p>
              )
            ) : null}
            <Link href={`/site/${slug}/request`} className="ps-footer-cta" style={{ marginTop: 12 }}>
              Request a Quote
            </Link>
          </div>

          {socialItems.length > 0 ? (
            <div>
              <div className="ps-footer-heading">Follow</div>
              <div className="ps-footer-social">
                {socialItems.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ps-footer-social-link"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="ps-footer-bottom">
          <span>
            &copy; {year} {companyName}
          </span>
          <span>
            Powered by{" "}
            <a href="https://fieldbaseapp.net" target="_blank" rel="noopener noreferrer">
              FieldBase
            </a>
          </span>
        </div>
      </div>
      <style>{`
        .ps-footer {
          background: #0f172a;
          color: rgba(255,255,255,0.72);
          padding: 48px 24px 28px;
          margin-top: 0;
        }
        .ps-footer-inner { max-width: 1200px; margin: 0 auto; }
        .ps-footer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 28px;
          margin-bottom: 28px;
        }
        .ps-footer-brand { font-size: 1.1rem; font-weight: 800; margin-bottom: 8px; }
        .ps-footer-heading { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin-bottom: 10px; }
        .ps-footer-copy { font-size: 0.88rem; line-height: 1.6; margin: 0; }
        .ps-footer-link { color: #e2e8f0; text-decoration: none; font-weight: 700; font-size: 0.95rem; }
        .ps-footer-link:hover { color: #fff; }
        .ps-footer-cta {
          display: inline-flex;
          background: ${themeColor};
          color: #fff;
          font-weight: 800;
          font-size: 0.82rem;
          padding: 10px 14px;
          border-radius: 8px;
          text-decoration: none;
        }
        .ps-footer-social { display: flex; flex-wrap: wrap; gap: 8px; }
        .ps-footer-social-link {
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #e2e8f0;
          text-decoration: none;
        }
        .ps-footer-social-link:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .ps-footer-bottom {
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 18px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 0.78rem;
        }
        .ps-footer-bottom a { color: rgba(255,255,255,0.85); text-decoration: none; }
      `}</style>
    </footer>
  );
}
