#!/usr/bin/env node
/**
 * Production-oriented Website Builder SaaS verification.
 * Usage: node scripts/verify-website-builder-saas.mjs [baseUrl]
 */
const base = String(process.argv[2] || process.env.APP_URL || "https://fieldbaseapp.net").replace(
  /\/$/,
  "",
);

const checks = [];

function pass(name, detail = "") {
  checks.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  checks.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchText(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "cache-control": "no-store",
    },
  });
  const text = await res.text();
  return { res, text };
}

async function main() {
  console.log(`\nWebsite Builder SaaS verify @ ${base}\n`);

  try {
    const health = await fetch(`${base}/api/health`, { cache: "no-store" });
    const healthJson = await health.json().catch(() => ({}));
    if (health.ok) {
      pass("Health endpoint", `commit ${healthJson.commitSha || "unknown"}`);
    } else {
      fail("Health endpoint", `status ${health.status}`);
    }
  } catch (e) {
    fail("Health endpoint", e.message);
  }

  try {
    const { res, text } = await fetchText("/sites/nonexistent-slug-verify-404");
    if (res.status === 404) pass("Unpublished/missing slug returns 404");
    else fail("Unpublished/missing slug", `status ${res.status}`);
    if (!text.includes("login")) pass("Public site HTML is not login shell");
    else fail("Public site leaked auth shell");
  } catch (e) {
    fail("Public site 404 check", e.message);
  }

  try {
    const res = await fetch(`${base}/site/legacy-redirect-check`, {
      redirect: "manual",
      cache: "no-store",
    });
    if ([301, 302, 308].includes(res.status)) {
      const loc = res.headers.get("location") || "";
      if (loc.includes("/sites/")) pass("Legacy /site redirects to /sites", loc);
      else fail("Legacy redirect target", loc || "missing location");
    } else {
      fail("Legacy /site redirect", `status ${res.status}`);
    }
  } catch (e) {
    fail("Legacy redirect", e.message);
  }

  try {
    const { res, text } = await fetchText("/sitemap.xml");
    if (res.ok && text.includes("/sites/")) pass("Sitemap lists /sites/ URLs");
    else fail("Sitemap", `ok=${res.ok} hasSites=${text.includes("/sites/")}`);
  } catch (e) {
    fail("Sitemap", e.message);
  }

  try {
    const { res, text } = await fetchText("/robots.txt");
    if (res.ok && text.toLowerCase().includes("sitemap")) pass("robots.txt references sitemap");
    else fail("robots.txt");
  } catch (e) {
    fail("robots.txt", e.message);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.\n`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
