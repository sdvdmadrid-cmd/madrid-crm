#!/usr/bin/env node
/**
 * Final Jobber validation phase runner (Phases 1–3 + deployment gates).
 * Phase 4 (manual browser QA) must be done separately while signed in.
 *
 * Usage:
 *   node scripts/jobber/run-validation-phase.mjs [tenant_id]
 *
 * Requires .env.local with Supabase + Jobber credentials for phases 1–3.
 */
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadJobberEnv, defaultTenantId, requireJobberOAuthEnv } from "./_env.mjs";
import { isJobberConfigured } from "../../src/lib/jobber/config.js";
import { JOBBER_PROVIDER } from "../../src/lib/jobber/config.js";

const tenantId = process.argv[2] || defaultTenantId();
const root = process.cwd();

function runNpm(script, extraArgs = []) {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", script, ...extraArgs],
    { cwd: root, encoding: "utf8", shell: true },
  );
  return {
    script,
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function runNode(relPath, args = []) {
  const result = spawnSync(process.execPath, [relPath, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  return {
    script: relPath,
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

loadJobberEnv();

const report = {
  generatedAt: new Date().toISOString(),
  tenantId,
  phases: {},
  deployReady: false,
  blockers: [],
};

// Phase 0 — production route deployment
const routes = runNode("scripts/jobber/verify-production-routes.mjs");
report.phases.routes = routes;
if (!routes.ok) {
  report.blockers.push(
    "Jobber API routes are not deployed on https://fieldbaseapp.net (404). Run Phase 1–4 on localhost against production DB, or deploy app code to staging/production first.",
  );
}

// Schema gate (always runnable)
for (const script of [
  "validate:jobber-schema",
  "audit:jobber-crm",
  "test:unit",
]) {
  const step = runNpm(script, script === "audit:jobber-crm" ? ["--", tenantId] : []);
  report.phases[script] = step;
  if (!step.ok) report.blockers.push(`${script} failed`);
}

// Phase 1 — OAuth env
let oauthConfigured = false;
try {
  requireJobberOAuthEnv();
  oauthConfigured = isJobberConfigured();
  report.phases.oauthConfig = { ok: oauthConfigured, script: "check-config" };
} catch (err) {
  report.phases.oauthConfig = { ok: false, error: err.message };
  report.blockers.push("JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET missing in .env.local");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: integration } = await supabase
  .from("integrations")
  .select("id, access_token, refresh_token, expires_at, metadata, updated_at")
  .eq("tenant_id", tenantId)
  .eq("provider", JOBBER_PROVIDER)
  .maybeSingle();

report.phases.integrationRow = {
  ok: Boolean(integration?.access_token),
  hasRefreshToken: Boolean(integration?.refresh_token),
  accountName: integration?.metadata?.accountName || "",
  lastSyncAt: integration?.metadata?.lastSyncAt || null,
};

if (!integration?.access_token) {
  report.blockers.push(
    "No Jobber integration row — complete OAuth (localhost or deployed host) or npm run jobber:store-tokens",
  );
}

// Phases 2–3 — only when tokens exist
if (integration?.access_token) {
  for (const [name, script] of [
    ["probe", "jobber:probe"],
    ["refreshTest", "jobber:refresh-test"],
    ["sync", "jobber:sync"],
    ["qaReport", "jobber:qa-report"],
  ]) {
    const step = runNpm(script, ["--", tenantId]);
    report.phases[name] = step;
    if (!step.ok) report.blockers.push(`${script} failed`);
  }
} else if (oauthConfigured) {
  report.blockers.push(
    "OAuth configured but not connected — run: npm run jobber:oauth-url, complete callback, then re-run this script",
  );
}

report.phases.manualQa = {
  ok: false,
  note: "Phase 4 requires signed-in browser QA on 3+ clients (not automatable here)",
};

report.deployReady =
  report.blockers.length === 0 &&
  report.phases.integrationRow?.ok &&
  report.phases.qaReport?.ok;

console.log(JSON.stringify(report, null, 2));
process.exit(report.deployReady ? 0 : 2);
