#!/usr/bin/env node
/**
 * Fail CI when public-schema tables lack RLS in migration history or new migrations skip same-file RLS.
 *
 * Usage:
 *   node scripts/validate-migration-rls.mjs           # full history audit
 *   node scripts/validate-migration-rls.mjs --changed # PR: strict check on touched SQL files
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  auditMigrationFileSameFileRule,
  auditMigrationHistory,
} from "./lib/parse-migration-rls.mjs";

const root = process.cwd();
const migrationsDir = join(root, "supabase", "migrations");
const changedOnly = process.argv.includes("--changed");

function loadMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
    .sort()
    .map((name) => ({
      name,
      content: readFileSync(join(migrationsDir, name), "utf8"),
    }));
}

function loadChangedMigrationFiles() {
  const baseRef = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "HEAD~1";

  let output = "";
  try {
    output = execSync(
      `git diff --name-only --diff-filter=AMR ${baseRef}...HEAD -- supabase/migrations`,
      { encoding: "utf8", cwd: root },
    );
  } catch {
    try {
      output = execSync("git diff --name-only --diff-filter=AMR HEAD~1 -- supabase/migrations", {
        encoding: "utf8",
        cwd: root,
      });
    } catch {
      return [];
    }
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".sql"))
    .map((relPath) => {
      const name = relPath.split(/[/\\]/).pop();
      return {
        name,
        content: readFileSync(join(migrationsDir, name), "utf8"),
      };
    });
}

const files = loadMigrationFiles();
const history = auditMigrationHistory(files);

console.log(`[rls-lint] Scanned ${files.length} migration file(s).`);

if (history.issues.length) {
  console.error("\n[rls-lint] FAIL — public tables without RLS in migration history:");
  for (const issue of history.issues) {
    console.error(`  - ${issue.message}`);
  }
} else {
  console.log(`[rls-lint] OK — all ${history.tableCount} created public table(s) have RLS enabled.`);
}

let changedIssues = [];
if (changedOnly) {
  const changed = loadChangedMigrationFiles();
  if (!changed.length) {
    console.log("[rls-lint] No changed migration files in this diff.");
  } else {
    console.log(`[rls-lint] Checking ${changed.length} changed migration file(s) (same-file rule)...`);
    for (const file of changed) {
      changedIssues.push(...auditMigrationFileSameFileRule(file.name, file.content));
    }
    if (changedIssues.length) {
      console.error("\n[rls-lint] FAIL — new/changed migrations must enable RLS in the same file:");
      for (const issue of changedIssues) {
        console.error(`  - ${issue.message}`);
      }
    } else {
      console.log("[rls-lint] OK — changed migrations satisfy same-file RLS rule.");
    }
  }
}

const failed = history.issues.length > 0 || changedIssues.length > 0;
if (failed) {
  console.error(
    "\n[rls-lint] See supabase/migrations/_example_public_table_with_rls.sql.example for the required pattern.",
  );
  process.exit(1);
}

process.exit(0);
