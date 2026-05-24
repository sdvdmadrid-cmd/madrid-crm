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

const remoteApplied = new Set();
for (const line of list.stdout.split(/\r?\n/)) {
  const match = line.match(/\|\s*(\d{14,})\s*\|/);
  if (match) remoteApplied.add(match[1]);
}

const localVersions = localFiles.map((f) => f.split("_")[0]);
const missingOnRemote = localVersions.filter((v) => {
  const row = list.stdout.includes(v);
  return !row;
});

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
  console.error("\n[validate] Local migrations not found in remote list output:");
  for (const v of missingOnRemote.slice(0, 10)) {
    const file = localFiles.find((f) => f.startsWith(v));
    console.error(`  - ${file || v}`);
  }
  if (missingOnRemote.length > 10) {
    console.error(`  ... and ${missingOnRemote.length - 10} more`);
  }
  process.exit(1);
}

console.log("\n[validate] All local migration versions appear on remote.");
process.exit(0);
