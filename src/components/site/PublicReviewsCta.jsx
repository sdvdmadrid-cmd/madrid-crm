const PLATFORM_LABELS = {
  google: "Google",
  yelp: "Yelp",
};

export default function PublicReviewsCta({
  googleUrl = "",
  yelpUrl = "",
  title = "See what customers say",
  subtitle = "Read verified reviews on Google and Yelp.",
}) {
  const links = [
    { platform: "google", href: googleUrl, label: "Google reviews" },
    { platform: "yelp", href: yelpUrl, label: "Yelp reviews" },
  ].filter((item) => String(item.href || "").startsWith("http"));

  if (!links.length) return null;

  return (
    <section className="ps-reviews-cta ps-reveal ps-visible" id="reviews">
      <div className="s-gallery-inner" style={{ textAlign: "center" }}>
        <h2 className="s-section-eyebrow">{title}</h2>
        {subtitle ? <p className="s-section-sub">{subtitle}</p> : null}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
            marginTop: 20,
          }}
        >
          {links.map((item) => (
            <a
              key={item.platform}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="s-btn-primary"
              style={{ textDecoration: "none" }}
            >
              {PLATFORM_LABELS[item.platform] || item.label} →
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
