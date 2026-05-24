#!/usr/bin/env node
/**
 * Post-deploy public website + lead pipeline validation.
 * Usage: node scripts/validate-public-production.mjs [baseUrl] [slug]
 */
const base = String(process.argv[2] || "https://fieldbaseapp.net").replace(/\/$/, "");
const slugArg = String(process.argv[3] || "").trim();

function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
  return false;
}

function ok(msg) {
  console.log(`  [OK] ${msg}`);
  return true;
}

async function fetchStatus(url, init) {
  const res = await fetch(url, { ...init, redirect: "manual" });
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { res, text, json };
}

async function discoverSlug() {
  if (slugArg) return slugArg;
  const { res, text } = await fetchStatus(`${base}/sitemap.xml`);
  if (!res.ok) return "";
  const matches = [...text.matchAll(/\/sites\/([a-z0-9-]+)/gi)];
  return matches[0]?.[1] || "";
}

async function main() {
  console.log(`\n[validate-public] Base: ${base}\n`);
  let failed = 0;

  const health = await fetchStatus(`${base}/api/health`);
  if (!health.res.ok || health.json?.status !== "ok") {
    failed += 1;
    fail(`/api/health (${health.res.status})`);
  } else {
    ok(`/api/health — commit ${health.json.commitSha || "?"}`);
  }

  const slug = await discoverSlug();
  if (!slug) {
    failed += 1;
    fail("No published slug found (pass slug as 2nd arg or publish a site)");
    console.log("\n[validate-public] Done with failures.\n");
    process.exit(1);
  }
  ok(`Using public slug: ${slug}`);

  const siteUrl = `${base}/sites/${slug}`;
  const site = await fetchStatus(siteUrl);
  if (!site.res.ok || site.res.status >= 400) {
    failed += 1;
    fail(`Public site ${siteUrl} (${site.res.status})`);
  } else {
    ok(`Public site loads (${site.res.status})`);
    if (/ps-reveal(?![\s\S]*ps-visible)/i.test(site.text) && site.text.includes("request-service")) {
      console.log("  [WARN] Some .ps-reveal sections may need ps-visible (check in browser)");
    }
    if (site.text.includes("irrigation") && !slug.includes("irrigation")) {
      console.log("  [WARN] Page mentions irrigation — verify services are contractor-defined");
    }
  }

  const config = await fetchStatus(`${base}/api/site/${slug}/lead-form-config`);
  if (!config.res.ok || config.json?.success !== true) {
    failed += 1;
    fail(`lead-form-config (${config.res.status}) — ${config.json?.error || config.text.slice(0, 120)}`);
  } else {
    const services = config.json?.data?.services || [];
    ok(`lead-form-config — ${services.length} service(s), canonical slug ${config.json?.data?.slug}`);
    if (!services.length) {
      failed += 1;
      fail("No services configured for lead form");
    }
  }

  const submit = await fetchStatus(`${base}/api/site/${slug}/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Production Validation",
      phone: "5550109999",
      email: "qa-validation@fieldbase.test",
      serviceNeeded: config.json?.data?.services?.[0] || "General",
      description: "Automated post-deploy lead pipeline test (safe to delete).",
      addressLine1: "100 Test St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      budgetRange: "under_500",
      timeline: "asap",
      contactPreference: "phone",
      formStartedAt: Date.now() - 5000,
      submissionId: `qa-${Date.now()}`,
    }),
  });

  if (!submit.res.ok || submit.json?.success !== true) {
    failed += 1;
    fail(`Lead submit (${submit.res.status}) — ${submit.json?.error || submit.text.slice(0, 200)}`);
    if (submit.json?.code === "not_found") {
      console.log("       Hint: site must be published; test live URL not builder preview.");
    }
  } else {
    ok(`Lead submit — leadId ${submit.json?.leadId || "(id returned)"}`);
  }

  const requestPage = await fetchStatus(`${base}/sites/${slug}/request`);
  if (!requestPage.res.ok) {
    failed += 1;
    fail(`Request page ${requestPage.res.status}`);
  } else {
    ok(`Request page loads`);
  }

  console.log(`\n[validate-public] ${failed ? `${failed} check(s) failed` : "All automated checks passed"}.`);
  console.log("Manual QA: gallery lightbox, mobile layout, photo upload, Turnstile, contractor Lead Inbox.\n");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
