import { listPublishedPublicWebsiteSlugs } from "@/lib/public-website";

const APP_BASE_URL = String(
  process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
).replace(/\/$/, "");

export default async function sitemap() {
  const now = new Date();
  const marketing = [
    { path: "/", changeFrequency: "daily", priority: 1.0 },
    { path: "/legal", changeFrequency: "monthly", priority: 0.6 },
    { path: "/legal-required", changeFrequency: "monthly", priority: 0.4 },
    { path: "/estimate", changeFrequency: "weekly", priority: 0.7 },
    { path: "/quote", changeFrequency: "weekly", priority: 0.7 },
  ];

  const publishedSites = await listPublishedPublicWebsiteSlugs();
  const contractorEntries = publishedSites.flatMap((site) => {
    const lastModified = site.updatedAt ? new Date(site.updatedAt) : now;
    const base = `${APP_BASE_URL}/sites/${site.slug}`;
    return [
      {
        url: base,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.85,
      },
      {
        url: `${base}/request`,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.75,
      },
    ];
  });

  return [
    ...marketing.map((item) => ({
      url: `${APP_BASE_URL}${item.path}`,
      lastModified: now,
      changeFrequency: item.changeFrequency,
      priority: item.priority,
    })),
    ...contractorEntries,
  ];
}
