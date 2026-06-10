#!/usr/bin/env node
/**
 * Audit public-schema RLS: migration history + optional live Supabase scan.
 *
 * Usage:
 *   npm run audit:schema-rls                 # migrations + remote (if linked)
 *   npm run audit:schema-rls -- --migrations-only
 *   npm run audit:schema-rls -- --remote-only
 *   npm run audit:schema-rls -- --json
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./load-env-local.mjs";
import {
  evaluateRlsAuditRows,
  parseSupabaseCsvTable,
} from "./lib/evaluate-rls-audit.mjs";

const root = process.cwd();
const migrationsOnly = process.argv.includes("--migrations-only");
const remoteOnly = process.argv.includes("--remote-only");
const jsonOut = process.argv.includes("--json");
const jsonPathArg = process.argv.find((a) => a.startsWith("--json-out="));
const jsonPath = jsonPathArg ? jsonPathArg.split("=")[1] : "";

/** @type {{ steps: object[], blocking: object[] }} */
const report = { steps: [], blocking: [] };

function step(name, ok, detail = "", extra = {}) {
  report.steps.push({ name, ok, detail, ...extra });
  const tag = ok ? "OK" : "FAIL";
  console.log(`[schema-rls] ${tag} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) report.blocking.push({ name, detail, ...extra });
}

function runMigrationLint() {
  const lint = spawnSync("node", ["scripts/validate-migration-rls.mjs"], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  const output = `${lint.stdout || ""}${lint.stderr || ""}`.trim();
  if (output) console.log(output);
  step("Migration RLS lint (all SQL files)", lint.status === 0, lint.status === 0 ? "passed" : "see errors above");
  return lint.status === 0;
}

function runRemoteAudit() {
  loadEnvLocal(root);
  const password = String(process.env.SUPABASE_DB_PASSWORD || "").trim();
  if (!password) {
    step(
      "Remote Supabase RLS scan",
      false,
      "SUPABASE_DB_PASSWORD missing — cannot verify production/staging database",
      { skipped: true, severity: "high" },
    );
    return false;
  }

  spawnSync("node", ["scripts/sync-supabase-cli-env.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });

  const query = spawnSync(
    "npx",
    [
      "supabase",
      "db",
      "query",
      "--linked",
      "-f",
      join(root, "scripts", "sql", "audit-public-rls-full.sql"),
      "-o",
      "csv",
    ],
    { cwd: root, encoding: "utf8", shell: true },
  );

  if (query.status !== 0) {
    step(
      "Remote Supabase RLS scan",
      false,
      (query.stderr || query.stdout || "query failed").trim().slice(0, 240),
    );
    return false;
  }

  const rows = parseSupabaseCsvTable(query.stdout || "");
  const evaluation = evaluateRlsAuditRows(rows);

  console.log(`[schema-rls] Scanned ${evaluation.tableCount} public table(s) on linked database.`);

  for (const finding of evaluation.findings) {
    if (finding.severity === "info") {
      console.log(`[schema-rls] INFO ${finding.table}: ${finding.message}`);
    }
  }

  if (evaluation.blocking.length) {
    for (const finding of evaluation.blocking) {
      console.error(`[schema-rls] ${finding.severity.toUpperCase()} ${finding.table}: ${finding.message}`);
    }
    step(
      "Remote Supabase RLS scan",
      false,
      `${evaluation.blocking.length} blocking finding(s)`,
      { findings: evaluation.blocking },
    );
    return false;
  }

  step("Remote Supabase RLS scan", true, `${evaluation.tableCount} tables OK`);
  return true;
}

console.log("[schema-rls] FieldBase public-schema RLS audit\n");
console.log(
  "[schema-rls] Root cause note: Jobber CRM migration (20260528140000) added client_* tables without an RLS block;",
);
console.log(
  "[schema-rls] app routes used supabaseAdmin (bypasses RLS) so the gap was invisible until Supabase Security Advisor flagged PostgREST exposure.\n",
);

let ok = true;

if (!remoteOnly) {
  ok = runMigrationLint() && ok;
}

if (!migrationsOnly) {
  ok = runRemoteAudit() && ok;
}

if (jsonOut || jsonPath) {
  const payload = JSON.stringify(report, null, 2);
  if (jsonPath) writeFileSync(jsonPath, payload, "utf8");
  if (jsonOut) console.log(payload);
}

if (!ok) {
  console.error(
    "\n[schema-rls] BLOCKED — fix findings or add an approved exception in supabase/security/rls-exceptions.json",
  );
  console.error("[schema-rls] Template: supabase/migrations/_example_public_table_with_rls.sql.example");
  process.exit(1);
}

console.log("\n[schema-rls] All checks passed.");
process.exit(0);
