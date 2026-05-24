#!/usr/bin/env node
/**
 * Verify Cloudflare Turnstile is production-ready on a deployed app.
 * Usage: node scripts/verify-turnstile-production.mjs [baseUrl] [slug]
 */
const base = String(process.argv[2] || "https://fieldbaseapp.net").replace(/\/$/, "");
const slug = String(process.argv[3] || "mysite").trim();

async function main() {
  console.log(`[turnstile-verify] Base: ${base}\n`);

  const healthRes = await fetch(`${base}/api/health`, { cache: "no-store" });
  const health = await healthRes.json().catch(() => ({}));
  const ts = health.turnstile || {};

  console.log("Health /api/health:");
  console.log(`  status: ${health.status}`);
  console.log(`  commit: ${health.commitSha || "?"}`);
  console.log(`  turnstile.mode: ${ts.mode || "unknown"}`);
  console.log(`  turnstile.verificationRequired: ${ts.verificationRequired === true}`);

  const configRes = await fetch(`${base}/api/site/${encodeURIComponent(slug)}/lead-form-config`);
  const configJson = await configRes.json().catch(() => ({}));
  const formTs = configJson?.data?.turnstile || {};

  console.log(`\nLead form config (/api/site/${slug}/lead-form-config):`);
  console.log(`  required: ${formTs.required === true}`);
  console.log(`  mode: ${formTs.mode || "unknown"}`);
  console.log(`  siteKey present: ${Boolean(formTs.siteKey)}`);

  let exitCode = 0;

  if (ts.mode === "test_rejected") {
    console.error("\n[FAIL] Production is using a Turnstile TEST key. Set production keys in Vercel and redeploy.");
    exitCode = 1;
  } else if (ts.mode === "misconfigured") {
    console.warn("\n[WARN] Turnstile partially configured. Set BOTH NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.");
    exitCode = 1;
  } else if (ts.mode === "disabled") {
    console.warn("\n[WARN] Turnstile disabled — leads submit without CAPTCHA. Add production keys in Vercel for bot protection.");
  } else if (ts.mode === "production") {
    console.log("\n[OK] Turnstile production mode active.");
  } else if (ts.mode === "test") {
    console.log("\n[OK] Turnstile test mode (development only).");
  }

  if (formTs.required && !formTs.siteKey) {
    console.error("[FAIL] Form requires Turnstile but no site key returned.");
    exitCode = 1;
  }

  console.log("\nVercel: set NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY (Production), then redeploy.");
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
