import Link from "next/link";
import { getPublicSiteCopy } from "@/lib/public-site-copy";

function mapsSearchUrl(address) {
  const q = String(address || "").trim();
  if (!q) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default function PublicSiteFooter({
  slug,
  companyName,
  logoUrl = "",
  phone,
  businessAddress,
  socialLinks = {},
  googleReviewsUrl = "",
  themeColor = "#1d4ed8",
  locale = "en",
}) {
  const copy = getPublicSiteCopy(locale);
  const footerCopy = copy.footer;
  const year = new Date().getFullYear();
  const mapUrl = mapsSearchUrl(businessAddress);

  const socialItems = [
    { key: "facebook", label: "Facebook", href: socialLinks.facebook },
    { key: "instagram", label: "Instagram", href: socialLinks.instagram },
    { key: "yelp", label: "Yelp", href: socialLinks.yelp },
    { key: "tiktok", label: "TikTok", href: socialLinks.tiktok },
    { key: "linkedin", label: "LinkedIn", href: socialLinks.linkedin },
    { key: "google", label: "Google", href: socialLinks.google || googleReviewsUrl },
    { key: "youtube", label: "YouTube", href: socialLinks.youtube },
  ].filter((item) => String(item.href || "").startsWith("http"));

  return (
    <footer className="s-footer">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 28,
            marginBottom: 28,
            textAlign: "left",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  style={{
                    width: 52,
                    height: 52,
                    objectFit: "contain",
                    borderRadius: 12,
                    background: "#fff",
                    padding: 6,
                    boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
                  }}
                />
              ) : null}
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff" }}>{companyName}</div>
            </div>
            <p style={{ fontSize: "0.88rem", lineHeight: 1.6, margin: 0, color: "rgba(255,255,255,0.72)" }}>
              {footerCopy.tagline}
            </p>
          </div>

          <div>
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#94a3b8",
                marginBottom: 10,
              }}
            >
              {footerCopy.contact}
            </div>
            {phone ? (
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                style={{ color: "#e2e8f0", textDecoration: "none", fontWeight: 700, fontSize: "0.95rem" }}
              >
                {phone}
              </a>
            ) : null}
            {businessAddress ? (
              mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    marginTop: 8,
                    color: "#e2e8f0",
                    textDecoration: "none",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                  }}
                >
                  {businessAddress}
                </a>
              ) : (
                <p style={{ marginTop: 8, fontSize: "0.88rem", color: "rgba(255,255,255,0.72)" }}>
                  {businessAddress}
                </p>
              )
            ) : null}
            <Link
              href={`/sites/${slug}/request`}
              style={{
                display: "inline-flex",
                marginTop: 12,
                background: themeColor,
                color: "#fff",
                fontWeight: 800,
                fontSize: "0.82rem",
                padding: "10px 14px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              {footerCopy.requestQuote}
            </Link>
          </div>

          {socialItems.length > 0 ? (
            <div>
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                  marginBottom: 10,
                }}
              >
                {footerCopy.follow}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {socialItems.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#e2e8f0",
                      textDecoration: "none",
                    }}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 18,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            fontSize: "0.78rem",
          }}
        >
          <span>
            &copy; {year} {companyName}
          </span>
          <span>
            {footerCopy.poweredBy}{" "}
            <a
              href="https://fieldbaseapp.net"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}
            >
              FieldBase
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
