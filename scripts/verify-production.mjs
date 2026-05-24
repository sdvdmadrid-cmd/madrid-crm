#!/usr/bin/env node
/**
 * Smoke-check production (or APP_BASE_URL) matches expected deploy + key routes.
 * Usage: node scripts/verify-production.mjs
 *        node scripts/verify-production.mjs https://fieldbaseapp.net
 */
const base = String(process.argv[2] || process.env.APP_BASE_URL || "https://fieldbaseapp.net").replace(
  /\/$/,
  "",
);

const routes = [
  { path: "/api/health", expect: 200, json: true },
  { path: "/website", expect: [200, 307, 308] },
  { path: "/settings/payments", expect: [200, 307, 308] },
  { path: "/lead-inbox", expect: [200, 307, 308] },
  { path: "/services-catalog", expect: [200, 307, 308] },
  { path: "/login", expect: 200 },
  { path: "/sitemap.xml", expect: 200 },
];

function okStatus(code, expected) {
  const list = Array.isArray(expected) ? expected : [expected];
  return list.includes(code);
}

async function checkRoute({ path, expect, json }) {
  const url = `${base}${path}`;
  const res = await fetch(url, { redirect: "manual" });
  const pass = okStatus(res.status, expect);
  let detail = "";
  if (json && res.ok) {
    const body = await res.json().catch(() => ({}));
    detail = `commitSha=${body.commitSha || "?"} stripeConnect=${body.stripeConnectEnabled}`;
  }
  if (path === "/login" && res.ok) {
    const html = await res.text().catch(() => "");
    const m = html.match(/data-fieldbase-build="([a-f0-9]{7,12})"/i);
    detail = `${detail} htmlBuild=${m?.[1] || "missing"}`;
    if (!m?.[1]) {
      return { path, status: res.status, pass: false, detail };
    }
  }
  return { path, status: res.status, pass, detail };
}

async function main() {
  console.log(`[verify-production] Base: ${base}\n`);
  let failed = 0;

  for (const route of routes) {
    const result = await checkRoute(route);
    const mark = result.pass ? "OK" : "FAIL";
    if (!result.pass) failed += 1;
    console.log(
      `  [${mark}] ${result.status} ${route.path}${result.detail ? ` — ${result.detail}` : ""}`,
    );
  }

  const healthRes = await fetch(`${base}/api/health`);
  if (healthRes.ok) {
    const h = await healthRes.json();
    console.log(`\n  Production build: ${h.commitSha || "unknown"}`);
    console.log(`  Compare with: git log origin/main -1 --oneline`);
  }

  if (failed > 0) {
    console.error(`\n[verify-production] ${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\n[verify-production] All checks passed");
}

main().catch((err) => {
  console.error("[verify-production]", err.message || err);
  process.exit(1);
});
