import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("public website cache uses 300s revalidate and slug tags", () => {
  const src = readFileSync(
    path.join(root, "src/lib/public-website-cache.js"),
    "utf8",
  );
  assert.match(src, /PUBLIC_SITE_REVALIDATE_SECONDS\s*=\s*300/);
  assert.match(src, /public-site:\$\{/);
  assert.match(src, /unstable_cache/);
  assert.match(src, /getCachedPublicWebsiteBySlug/);
  assert.match(src, /getCachedPublicReviewsBySlug/);
});

test("publish/unpublish invalidate public site cache tags", () => {
  const routing = readFileSync(
    path.join(root, "src/lib/public-website-routing.js"),
    "utf8",
  );
  assert.match(routing, /revalidateTag\(`public-site:\$\{normalized\}`\)/);

  for (const file of [
    "src/app/api/website-builder/publish/route.js",
    "src/app/api/website-builder/unpublish/route.js",
    "src/app/api/website-builder/route.js",
  ]) {
    const src = readFileSync(path.join(root, file), "utf8");
    assert.match(src, /revalidateTag/);
    assert.match(src, /revalidatePublicWebsitePaths\([^)]*revalidateTag/);
  }
});

test("public site pages use cached getters and generateStaticParams", () => {
  const home = readFileSync(
    path.join(root, "src/app/site/[slug]/page.js"),
    "utf8",
  );
  const request = readFileSync(
    path.join(root, "src/app/site/[slug]/request/page.js"),
    "utf8",
  );
  for (const src of [home, request]) {
    assert.match(src, /PUBLIC_SITE_REVALIDATE_SECONDS/);
    assert.match(src, /generateStaticParams/);
    assert.match(src, /getCachedPublicWebsiteBySlug/);
  }
  assert.match(home, /getCachedPublicReviewsBySlug/);
});

test("website builder client dynamically loads heavy panels", () => {
  const src = readFileSync(
    path.join(root, "src/components/website-builder/WebsiteBuilderClient.jsx"),
    "utf8",
  );
  assert.match(src, /from "next\/dynamic"/);
  assert.match(src, /WebsiteBuilderSetupPanel/);
  assert.match(src, /WebsiteBuilderLaunch/);
  assert.match(src, /WebsiteBuilderPortfolio/);
  assert.match(src, /WebsiteMobileUploads/);
  assert.match(src, /HeroImageEditor/);
  assert.match(src, /dynamic\(\s*\(\)\s*=>\s*import\(/);
});
