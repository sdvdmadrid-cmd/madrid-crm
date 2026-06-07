import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("estimates page prefetches first list page on the server", () => {
  const src = readFileSync(path.join(root, "src/app/estimates/page.js"), "utf8");
  assert.match(src, /listEstimatesForTenant/);
  assert.match(src, /EstimatesPageClient/);
  assert.doesNotMatch(src, /"use client"/);
});

test("estimates API uses paginated list helper", () => {
  const src = readFileSync(
    path.join(root, "src/app/api/estimates/route.js"),
    "utf8",
  );
  assert.match(src, /listEstimatesForTenant/);
  assert.match(src, /getListPaginationParams/);
  assert.doesNotMatch(src, /\.limit\(250\)/);
});

test("AuthShell removes dead feature-flags fetch", () => {
  const src = readFileSync(path.join(root, "src/components/AuthShell.js"), "utf8");
  assert.doesNotMatch(src, /\/api\/feature-flags/);
  assert.doesNotMatch(src, /platformFlags/);
});

test("InstantNavigation only mounts for authenticated shell", () => {
  const layout = readFileSync(path.join(root, "src/app/layout.js"), "utf8");
  const shell = readFileSync(path.join(root, "src/components/AuthShell.js"), "utf8");
  assert.doesNotMatch(layout, /InstantNavigation/);
  assert.match(shell, /InstantNavigation/);
});

test("middleware skips session work on public fast paths", () => {
  const src = readFileSync(path.join(root, "middleware.js"), "utf8");
  assert.match(src, /tryPublicFastPath/);
  assert.match(src, /isMiddlewarePublicFastPath/);
});

test("contact form defers notifications with after()", () => {
  const src = readFileSync(
    path.join(root, "src/app/api/site/[slug]/contact/route.js"),
    "utf8",
  );
  assert.match(src, /after\(/);
  assert.match(src, /runWebsiteLeadSideEffects/);
});

test("public site gallery uses next/image", () => {
  const src = readFileSync(
    path.join(root, "src/components/site/PremiumGallery.jsx"),
    "utf8",
  );
  assert.match(src, /from "next\/image"/);
  assert.doesNotMatch(src, /<img\s/);
});
