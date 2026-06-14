import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLoginRedirectPath,
  resolvePostLoginPath,
  sanitizeRedirectPath,
  unwrapRedirectParam,
} from "../../src/lib/auth-redirect.js";

test("sanitizeRedirectPath blocks auth entry and open redirects", () => {
  assert.equal(sanitizeRedirectPath("/login"), "");
  assert.equal(sanitizeRedirectPath("//evil.com"), "");
  assert.equal(sanitizeRedirectPath("/auth/callback"), "");
  assert.equal(sanitizeRedirectPath("/legal-required"), "");
  assert.equal(sanitizeRedirectPath("/login?redirect=/dashboard"), "/dashboard");
});

test("unwrapRedirectParam unwraps nested redirect params", () => {
  assert.equal(
    unwrapRedirectParam("/login?redirect=%2Fdashboard"),
    "/dashboard",
  );
  assert.equal(
    unwrapRedirectParam("/login?next=%2Fclients"),
    "/clients",
  );
  assert.equal(unwrapRedirectParam("/login?redirect=%2Flogin"), "");
  assert.equal(
    unwrapRedirectParam("/login?redirect=%2Flogin%3Fredirect%3D%2Fdashboard"),
    "/dashboard",
  );
});

test("sanitizeRedirectPath blocks non-super_admin from owner routes", () => {
  assert.equal(
    sanitizeRedirectPath("/owner/overview", { role: "admin" }),
    "",
  );
  assert.equal(
    sanitizeRedirectPath("/owner/overview", { role: "super_admin" }),
    "/owner/overview",
  );
});

test("resolvePostLoginPath uses role default when redirect invalid", () => {
  assert.equal(
    resolvePostLoginPath({ role: "admin" }, "/login?redirect=/dashboard"),
    "/dashboard",
  );
  assert.equal(
    resolvePostLoginPath({ role: "super_admin" }, "/login"),
    "/owner/overview",
  );
  assert.equal(
    resolvePostLoginPath({ role: "admin" }, "/clients"),
    "/clients",
  );
});

test("buildLoginRedirectPath avoids bare login redirects", () => {
  assert.equal(buildLoginRedirectPath("/login"), "/login");
  assert.equal(
    buildLoginRedirectPath("/dashboard"),
    "/login?redirect=%2Fdashboard",
  );
  assert.equal(
    buildLoginRedirectPath("/login?redirect=/clients"),
    "/login?redirect=%2Fclients",
  );
});
