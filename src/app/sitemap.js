const APP_BASE_URL = String(
  process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
).replace(/\/$/, "");

export default function sitemap() {
  const now = new Date();

  const entries = [
    { path: "/", changeFrequency: "daily", priority: 1.0 },
    { path: "/legal", changeFrequency: "monthly", priority: 0.6 },
    { path: "/legal-required", changeFrequency: "monthly", priority: 0.4 },
    { path: "/estimate", changeFrequency: "weekly", priority: 0.7 },
    { path: "/quote", changeFrequency: "weekly", priority: 0.7 },
  ];

  return entries.map((item) => ({
    url: `${APP_BASE_URL}${item.path}`,
    lastModified: now,
    changeFrequency: item.changeFrequency,
    priority: item.priority,
  }));
}
