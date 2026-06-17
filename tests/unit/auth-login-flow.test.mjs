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
  assert.match(loginBlock, /if \(edgeSession && !isLogoutGuardCookieSet\(request\)/);
  assert.doesNotMatch(loginBlock, /hasConfirmedSupabaseUser\)\s*\{/);
});

test("AuthShell logout clears Supabase browser session", () => {
  const src = readFileSync(path.join(root, "src/components/AuthShell.js"), "utf8");
  assert.match(src, /performClientLogout/);
  assert.match(src, /isClientLoggedOut/);
  assert.match(src, /performAuthHardNavigate\("\/login"\)/);
});

test("performClientLogout awaits server logout before hard navigate", () => {
  const src = readFileSync(path.join(root, "src/lib/auth-logout-client.js"), "utf8");
  const awaitIndex = src.indexOf("await postServerLogout()");
  const navigateIndex = src.indexOf("performAuthHardNavigate(redirectTo)");
  assert.ok(awaitIndex >= 0);
  assert.ok(navigateIndex > awaitIndex);
  assert.match(src, /credentials:\s*"include"/);
  assert.match(src, /postServerLogout/);
});

test("OwnerLogoutButton uses centralized performClientLogout", () => {
  const src = readFileSync(
    path.join(root, "src/components/owner/OwnerLogoutButton.js"),
    "utf8",
  );
  assert.match(src, /performClientLogout/);
  assert.doesNotMatch(src, /performAuthHardNavigate/);
});

test("owner layout redirects when logout guard cookie is set", () => {
  const src = readFileSync(path.join(root, "src/app/owner/layout.js"), "utf8");
  assert.match(src, /LOGOUT_GUARD_COOKIE/);
  assert.match(src, /redirect\('\/login'\)/);
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

test("middleware login redirect respects logout guard cookie", () => {
  const src = readFileSync(path.join(root, "middleware.js"), "utf8");
  assert.match(src, /isLogoutGuardCookieSet/);
  const loginBlock = src.slice(
    src.indexOf('if (["/verify-email", "/sign-in", "/login"].includes(pathname))'),
    src.indexOf("if (pathname === \"/website-builder\")"),
  );
  assert.match(loginBlock, /edgeSession && !isLogoutGuardCookieSet\(request\)/);
});

test("AuthShell renders owner command center without authUser gate", () => {
  const src = readFileSync(path.join(root, "src/components/AuthShell.js"), "utf8");
  const ownerBlock = src.slice(
    src.indexOf("if (isSubscribePage)"),
    src.indexOf("if (authUser && shouldRestrictForSubscription"),
  );
  assert.match(ownerBlock, /if \(isOwnerCommandCenter\)/);
  assert.match(ownerBlock, /auth-shell-owner-root/);
});

test("AuthShell renders subscribe page without authUser gate", () => {
  const src = readFileSync(path.join(root, "src/components/AuthShell.js"), "utf8");
  assert.match(src, /if \(isSubscribePage\)\s*\{\s*return children;/s);
});
