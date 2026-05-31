import Link from "next/link";
import { getPublicSiteCopy } from "@/lib/public-site-copy";
import { PUBLIC_SITE_NAV_LINKS, parseInPageHash } from "@/lib/public-site-navigation";

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
  const displayCta = ctaText || navCopy.getQuote;
  const ctaHash = parseInPageHash(requestHref || "");
  const ctaIsInPage = Boolean(ctaHash);

  const linkLabels = {
    services: navCopy.services,
    gallery: navCopy.gallery,
    reviews: navCopy.reviews,
    about: navCopy.about,
    contact: navCopy.contact,
  };

  return (
    <nav className="s-nav">
      <Link href={`/sites/${slug}`} className="s-logo">
        <div className="s-logo-icon" style={{ background: themeColor }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" />
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
        {PUBLIC_SITE_NAV_LINKS.map(({ key, hash }) => (
          <a key={key} href={hash} data-nav-section={key}>
            {linkLabels[key]}
          </a>
        ))}
      </div>

      <div className="s-nav-actions">
        {phone ? (
          <a href={`tel:${phone.replace(/\s/g, "")}`} className="s-nav-phone">
            {phone}
          </a>
        ) : null}
        {ctaIsInPage ? (
          <a
            href={`#${ctaHash}`}
            className="s-nav-cta"
            style={{ background: themeColor }}
            data-nav-section="estimate"
          >
            {displayCta}
          </a>
        ) : (
          <Link
            href={requestHref || `/sites/${slug}/request`}
            className="s-nav-cta"
            style={{ background: themeColor }}
          >
            {displayCta}
          </Link>
        )}
      </div>

      <style>{`
        .s-nav { position: sticky; top: 0; z-index: 100; background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; gap: 12px; flex-wrap: wrap; }
        .s-logo { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: clamp(1.05rem, 2.5vw, 1.35rem); color: #fff; letter-spacing: -0.5px; text-decoration: none; }
        .s-logo-icon { width: clamp(44px, 8vw, 64px); height: clamp(44px, 8vw, 64px); border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; background: linear-gradient(155deg, #fff 0%, #e2e8f0 100%); box-shadow: 0 12px 28px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.7) inset; animation: siteBrandIn 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        .s-logo-icon img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
        @keyframes siteBrandIn { from { opacity: 0; transform: translateY(10px) scale(0.94); } to { opacity: 1; transform: none; } }
        .s-nav-links { display: flex; align-items: center; gap: 20px; font-size: 14px; flex-wrap: wrap; justify-content: center; }
        .s-nav-links a { color: #94a3b8; text-decoration: none; font-weight: 600; transition: color 0.15s; }
        .s-nav-links a:hover { color: #fff; }
        .s-nav-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .s-nav-phone { color: #e2e8f0 !important; padding: 8px 14px; border-radius: 6px; font-weight: 700; font-size: 14px; text-decoration: none; border: 1px solid rgba(255,255,255,0.2); white-space: nowrap; }
        .s-nav-phone:hover { background: rgba(255,255,255,0.08); color: #fff !important; }
        .s-nav-cta { color: #fff !important; padding: 8px 20px; border-radius: 6px; font-weight: 700; font-size: 14px; text-decoration: none; white-space: nowrap; }
        .s-nav-cta:hover { filter: brightness(1.1); }
        @media (max-width: 720px) { .s-nav-links { display: none; } }
      `}</style>
    </nav>
  );
}
