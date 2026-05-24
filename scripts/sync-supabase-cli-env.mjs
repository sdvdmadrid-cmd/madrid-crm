#!/usr/bin/env node
/**
 * Sync SUPABASE_DB_PASSWORD from .env.local → supabase/.env.cli for the CLI.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./load-env-local.mjs";

const root = process.cwd();
const loaded = loadEnvLocal(root);
if (!loaded.ok) {
  console.error(`[sync-supabase-cli-env] ${loaded.error}`);
  process.exit(1);
}

const password = String(process.env.SUPABASE_DB_PASSWORD || "").trim();
if (!password) {
  console.error(
    "[sync-supabase-cli-env] SUPABASE_DB_PASSWORD is missing in .env.local (Supabase → Project Settings → Database).",
  );
  process.exit(1);
}

const cliEnvPath = resolve(root, "supabase", ".env.cli");
const body = `# Auto-synced from .env.local — do not commit\nSUPABASE_DB_PASSWORD=${password}\n`;
writeFileSync(cliEnvPath, body, "utf8");
console.log("[sync-supabase-cli-env] Updated supabase/.env.cli (password not printed).");
