import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("middleware login redirect requires app session cookie, not Supabase alone", () => {
  const src = readFileSync(path.join(root, "middleware.js"), "utf8");
  const loginBlock = src.slice(
    src.indexOf('if (["/verify-email", "/sign-in", "/login"].includes(pathname))'),
    src.indexOf("if (pathname === \"/website-builder\")"),
  );
  assert.match(loginBlock, /if \(edgeSession\)/);
  assert.doesNotMatch(loginBlock, /hasConfirmedSupabaseUser\)\s*\{/);
});

test("AuthShell logout clears Supabase browser session", () => {
  const src = readFileSync(path.join(root, "src/components/AuthShell.js"), "utf8");
  assert.match(src, /supabase\.auth\.signOut\(\)/);
  assert.match(src, /markClientLoggedOut\(\)/);
  assert.match(src, /router\.replace\("\/login"\)/);
});

test("logout API sets guard cookie and clears supabase session", () => {
  const src = readFileSync(path.join(root, "src/app/api/auth/logout/route.js"), "utf8");
  assert.match(src, /buildLogoutGuardCookie/);
  assert.match(src, /supabase\.auth\.signOut/);
});

test("auth/me blocks supabase restore when logout guard cookie is set", () => {
  const src = readFileSync(path.join(root, "src/app/api/auth/me/route.js"), "utf8");
  assert.match(src, /isLogoutGuardCookieSet/);
});

test("auth/sync skips session restore when logout guard cookie is set", () => {
  const src = readFileSync(path.join(root, "src/app/api/auth/sync/route.js"), "utf8");
  assert.match(src, /isLogoutGuardCookieSet/);
});
