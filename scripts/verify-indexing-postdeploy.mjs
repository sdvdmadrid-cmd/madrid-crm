const APP_BASE_URL = String(
  process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
).replace(/\/$/, "");

const INDEXNOW_KEY =
  process.env.INDEXNOW_KEY || "23f0c57e9bc74d35b8a5a90c5fc4a1a1";

const checks = [
  {
    name: "robots",
    url: `${APP_BASE_URL}/robots.txt`,
    mustContain: "Sitemap:",
  },
  {
    name: "sitemap",
    url: `${APP_BASE_URL}/sitemap.xml`,
    mustContain: "<urlset",
  },
  {
    name: "indexnow-key",
    url: `${APP_BASE_URL}/${INDEXNOW_KEY}.txt`,
    mustContain: INDEXNOW_KEY,
  },
];

let hasError = false;

for (const check of checks) {
  try {
    const response = await fetch(check.url, {
      method: "GET",
      headers: { "user-agent": "fieldbase-indexing-verifier/1.0" },
    });

    const body = await response.text();
    const containsExpected = body.includes(check.mustContain);

    if (!response.ok || !containsExpected) {
      hasError = true;
      console.error(
        `[FAIL] ${check.name} status=${response.status} containsExpected=${containsExpected} url=${check.url}`,
      );
      continue;
    }

    console.log(`[OK] ${check.name} status=${response.status} url=${check.url}`);
  } catch (error) {
    hasError = true;
    console.error(`[FAIL] ${check.name} error=${error?.message || "unknown"} url=${check.url}`);
  }
}

if (hasError) {
  process.exit(1);
}

console.log("Post-deploy indexing verification passed.");
