import Link from "next/link";
import { getPublicSiteCopy } from "@/lib/public-site-copy";

export default function PublicSiteNav({
  slug,
  companyName,
  logoUrl,
  phone,
  ctaText,
  themeColor = "#1d4ed8",
  requestHref,
  locale = "en",
}) {
  const copy = getPublicSiteCopy(locale);
  const navCopy = copy.nav;
  const quoteHref = requestHref || `/sites/${slug}/request`;
  const displayCta = ctaText || navCopy.getQuote;

  return (
    <nav className="s-nav">
      <Link href={`/sites/${slug}`} className="s-logo">
        <div className="s-logo-icon" style={{ background: themeColor }}>
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

      <div className="s-nav-links">
        <a href="#services">{navCopy.services}</a>
        <a href="#about">{navCopy.about}</a>
        <a href="#contact">{navCopy.contact}</a>
      </div>

      {phone ? (
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="s-nav-cta" style={{ background: themeColor }}>
          {phone}
        </a>
      ) : (
        <Link href={quoteHref} className="s-nav-cta" style={{ background: themeColor }}>
          {displayCta}
        </Link>
      )}

      <style>{`
        .s-nav { position: sticky; top: 0; z-index: 100; background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; gap: 12px; flex-wrap: wrap; }
        .s-logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 20px; color: #fff; letter-spacing: -0.5px; text-decoration: none; }
        .s-logo-icon { width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
        .s-nav-links { display: flex; align-items: center; gap: 24px; font-size: 14px; }
        .s-nav-links a { color: #94a3b8; text-decoration: none; font-weight: 600; transition: color 0.15s; }
        .s-nav-links a:hover { color: #fff; }
        .s-nav-cta { color: #fff !important; padding: 8px 20px; border-radius: 6px; font-weight: 700; font-size: 14px; text-decoration: none; white-space: nowrap; }
        .s-nav-cta:hover { filter: brightness(1.1); }
        @media (max-width: 600px) { .s-nav-links { display: none; } }
      `}</style>
    </nav>
  );
}
