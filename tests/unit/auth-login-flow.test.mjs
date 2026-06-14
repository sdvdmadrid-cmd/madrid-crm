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
  assert.match(src, /authBootstrappedRef\.current = false/);
});

test("OwnerLogoutButton clears Supabase browser session", () => {
  const src = readFileSync(
    path.join(root, "src/components/owner/OwnerLogoutButton.js"),
    "utf8",
  );
  assert.match(src, /supabase\.auth\.signOut\(\)/);
});
