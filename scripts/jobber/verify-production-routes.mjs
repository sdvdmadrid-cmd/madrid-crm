#!/usr/bin/env node
/**
 * Verify Jobber integration API routes are deployed on a host.
 * Usage: node scripts/jobber/verify-production-routes.mjs [baseUrl]
 */
const baseUrl = (process.argv[2] || "https://fieldbaseapp.net").replace(/\/$/, "");

const routes = [
  "/api/integrations/jobber/connect",
  "/api/integrations/jobber/callback",
  "/api/integrations/jobber/status",
  "/api/integrations/jobber/sync",
];

const results = [];

for (const path of routes) {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual" });
    const deployed = response.status !== 404;
    results.push({
      path,
      status: response.status,
      deployed,
      note: deployed
        ? "route exists"
        : "404 — Jobber integration not deployed on this host",
    });
  } catch (err) {
    results.push({ path, status: null, deployed: false, error: err.message });
  }
}

const allDeployed = results.every((row) => row.deployed);
console.log(JSON.stringify({ baseUrl, allDeployed, results }, null, 2));
process.exit(allDeployed ? 0 : 3);
