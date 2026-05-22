import Link from "next/link";

export default function PublicSiteNav({
  slug,
  companyName,
  logoUrl,
  phone,
  ctaText = "Get a Quote",
  themeColor = "#1d4ed8",
  requestHref,
}) {
  const quoteHref = requestHref || `/site/${slug}/request`;

  return (
    <nav className="ps-nav">
      <Link href={`/site/${slug}`} className="ps-logo">
        <div className="ps-logo-icon" style={{ background: themeColor }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
              <path
                d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                stroke="#fff"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        <span>{companyName}</span>
      </Link>

      <div className="ps-nav-links">
        <a href="#services">Services</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
      </div>

      {phone ? (
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="ps-nav-cta" style={{ background: themeColor }}>
          {phone}
        </a>
      ) : (
        <Link href={quoteHref} className="ps-nav-cta" style={{ background: themeColor }}>
          {ctaText}
        </Link>
      )}

      <style>{`
        .ps-nav {
          background: #1e293b;
          padding: 12px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          position: sticky;
          top: 0;
          z-index: 40;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .ps-logo {
          color: #fff;
          font-weight: 800;
          font-size: 17px;
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }
        .ps-logo-icon {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .ps-nav-links { display: flex; gap: 16px; font-size: 12px; }
        .ps-nav-links a { color: #94a3b8; font-weight: 600; text-decoration: none; }
        .ps-nav-links a:hover { color: #fff; }
        .ps-nav-cta {
          color: #fff;
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .ps-nav-links { display: none; }
        }
      `}</style>
    </nav>
  );
}
