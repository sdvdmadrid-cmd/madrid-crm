import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("next.config enables CDN cache for public contractor sites", () => {
  const src = readFileSync(path.join(root, "next.config.mjs"), "utf8");
  assert.match(src, /source:\s*"\/sites\/:path\*"/);
  assert.match(src, /s-maxage=120/);
  assert.match(src, /stale-while-revalidate=600/);
});

test("middleware rate-limits API mutations only", () => {
  const src = readFileSync(path.join(root, "middleware.js"), "utf8");
  assert.match(src, /Rate limiting on mutations only/);
  assert.match(src, /if \(isWrite\)/);
  assert.doesNotMatch(src, /RL_READ_LIMIT/);
});

test("auth/me workspace enrichment uses response cache", () => {
  const src = readFileSync(
    path.join(root, "src/lib/auth-me-workspace.js"),
    "utf8",
  );
  assert.match(src, /getApiResponseCache/);
  assert.match(src, /auth-me-workspace:/);
});

test("clients page prefetches first list page on the server", () => {
  const src = readFileSync(path.join(root, "src/app/clients/page.js"), "utf8");
  assert.match(src, /listClientsForTenant/);
  assert.match(src, /initialList/);
});
