#!/usr/bin/env node
/**
 * Applies SQL files in supabase/migrations via Supabase CLI when available.
 * Usage: node scripts/apply-supabase-migrations.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
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

const push = spawnSync("npx", ["supabase", "db", "push"], {
  shell: true,
  stdio: "inherit",
  env: process.env,
});

if (push.status !== 0) {
  console.error("[migrations] supabase db push failed. Link project first: npx supabase link");
  process.exit(push.status || 1);
}

console.log("[migrations] Applied successfully.");
