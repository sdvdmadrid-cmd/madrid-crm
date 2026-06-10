#!/usr/bin/env node
/**
 * Verify remote migration history vs local supabase/migrations files.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./load-env-local.mjs";

const root = process.cwd();
const loaded = loadEnvLocal(root);
if (!loaded.ok) {
  console.error(loaded.error);
  process.exit(1);
}

const password = String(process.env.SUPABASE_DB_PASSWORD || "").trim();
if (!password) {
  console.error("SUPABASE_DB_PASSWORD missing");
  process.exit(1);
}

const localFiles = readdirSync(join(root, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const list = spawnSync(
  "npx",
  ["supabase", "migration", "list", "--linked", "-p", password],
  { shell: true, encoding: "utf8", cwd: root },
);

if (list.status !== 0) {
  console.error("[validate] migration list failed");
  console.error(list.stderr || list.stdout);
  process.exit(list.status || 1);
}

console.log(list.stdout);

const localVersions = localFiles.map((f) => f.split("_")[0]);
const missingOnRemote = [];

for (const line of list.stdout.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("Local") || trimmed.startsWith("---")) continue;
  const parts = trimmed.split("|").map((p) => p.trim());
  if (parts.length < 2) continue;
  const localVer = parts[0];
  const remoteVer = parts[1] || "";
  if (/^\d{14,}$/.test(localVer) && localVer !== remoteVer) {
    missingOnRemote.push(localVer);
  }
}

const checks = [
  { table: "contractor_reviews", column: null },
  { table: "contractor_website_leads", column: "budget_range" },
  { table: "contractor_social_profiles", column: null },
];

const { createClient } = await import("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  const sb = createClient(url, key);
  console.log("\n[validate] Schema probes (read-only):");
  for (const { table, column } of checks) {
    const sel = column ? column : "id";
    const { error } = await sb.from(table).select(sel).limit(1);
    console.log(`  ${error ? "FAIL" : "OK"} ${table}${column ? `.${column}` : ""}${error ? ` — ${error.message}` : ""}`);
  }
}

if (missingOnRemote.length) {
  console.error("\n[validate] Local migrations not applied on remote:");
  for (const v of missingOnRemote.slice(0, 10)) {
    const file = localFiles.find((f) => f.startsWith(v));
    console.error(`  - ${file || v}`);
  }
  if (missingOnRemote.length > 10) {
    console.error(`  ... and ${missingOnRemote.length - 10} more`);
  }
  process.exit(1);
}

console.log("\n[validate] All local migration versions are applied on remote.");

// Remote RLS audit (requires linked DB)
const rlsQuery = spawnSync(
  "npx",
  [
    "supabase",
    "db",
    "query",
    "--linked",
    "-f",
    join(root, "scripts", "sql", "audit-public-rls-disabled.sql"),
    "-o",
    "csv",
  ],
  { shell: true, encoding: "utf8", cwd: root },
);

if (rlsQuery.status === 0) {
  const rows = (rlsQuery.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dataRows = rows.slice(1);
  if (dataRows.length) {
    console.error("\n[validate] FAIL — public tables without RLS on remote:");
    for (const row of dataRows) {
      console.error(`  - ${row}`);
    }
    process.exit(1);
  }
  console.log("[validate] Remote RLS audit OK — no public tables with RLS disabled.");
} else {
  console.warn(
    "[validate] Skipped remote RLS audit (supabase db query unavailable in this environment).",
  );
}

process.exit(0);
