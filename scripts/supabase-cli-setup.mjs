#!/usr/bin/env node
/**
 * Full Supabase CLI setup: sync env → link → db push → validate.
 */
import { spawnSync } from "node:child_process";
import { loadEnvLocal } from "./load-env-local.mjs";

const PROJECT_REF = "fhcbnupmdpphzdafmmgd";
const root = process.cwd();

function run(label, args) {
  console.log(`\n[supabase-setup] ${label}…`);
  const result = spawnSync("npx", args, {
    shell: true,
    stdio: "inherit",
    cwd: root,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[supabase-setup] Failed: ${label}`);
    process.exit(result.status || 1);
  }
}

const loaded = loadEnvLocal(root);
if (!loaded.ok) {
  console.error(`[supabase-setup] ${loaded.error}`);
  process.exit(1);
}

const password = String(process.env.SUPABASE_DB_PASSWORD || "").trim();
if (!password) {
  console.error("[supabase-setup] Set SUPABASE_DB_PASSWORD in .env.local first.");
  process.exit(1);
}

console.log("[supabase-setup] .env.local OK (SUPABASE_DB_PASSWORD present, not printed).");

run("sync-supabase-cli-env", ["node", "scripts/sync-supabase-cli-env.mjs"]);
run("link", [
  "supabase",
  "link",
  "--project-ref",
  PROJECT_REF,
  "--password",
  password,
  "--yes",
]);
run("db push (dry-run)", ["supabase", "db", "push", "--linked", "-p", password, "--dry-run"]);
run("db push", ["supabase", "db", "push", "--linked", "-p", password, "--yes"]);
run("migration list", ["supabase", "migration", "list", "--linked", "-p", password]);

const validate = spawnSync("node", ["scripts/validate-supabase-migrations.mjs"], {
  shell: true,
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(validate.status || 0);
