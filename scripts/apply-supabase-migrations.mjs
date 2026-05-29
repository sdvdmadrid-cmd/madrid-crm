#!/usr/bin/env node
/**
 * Applies SQL files in supabase/migrations via Supabase CLI when available.
 * Usage: node scripts/apply-supabase-migrations.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "./load-env-local.mjs";

const root = process.cwd();
const envLoad = loadEnvLocal(root);
if (!envLoad.ok) {
  console.error(`[migrations] ${envLoad.error}`);
  process.exit(1);
}

spawnSync("node", ["scripts/sync-supabase-cli-env.mjs"], {
  shell: true,
  stdio: "inherit",
  cwd: root,
});

const password = String(process.env.SUPABASE_DB_PASSWORD || "").trim();
const passwordFlag = password ? ["-p", password] : [];

const migrationsDir = path.join(root, "supabase", "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

console.log(`[migrations] Found ${files.length} SQL files.`);

const which = spawnSync("npx", ["supabase", "--version"], { shell: true, encoding: "utf8" });
if (which.status !== 0) {
  console.error("[migrations] Supabase CLI not available. Install: npm i -D supabase");
  console.error("[migrations] Or run SQL manually in Supabase dashboard:");
  for (const file of files) {
    console.error(`  - ${path.join("supabase/migrations", file)}`);
  }
  process.exit(1);
}

const push = spawnSync(
  "npx",
  ["supabase", "db", "push", "--linked", "--include-all", ...passwordFlag, "--yes"],
  {
  shell: true,
  stdio: "inherit",
  env: process.env,
  cwd: root,
});

if (push.status !== 0) {
  console.error("[migrations] supabase db push failed. Link project first: npx supabase link");
  process.exit(push.status || 1);
}

console.log("[migrations] Applied successfully.");
