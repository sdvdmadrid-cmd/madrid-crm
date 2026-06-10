import assert from "node:assert/strict";
import test from "node:test";
import {
  auditMigrationFileSameFileRule,
  auditMigrationHistory,
  parseMigrationSql,
} from "../../scripts/lib/parse-migration-rls.mjs";

test("parseMigrationSql detects create and enable rls in same file", () => {
  const sql = `
    create table if not exists public.widgets (
      id uuid primary key
    );
    alter table public.widgets enable row level security;
  `;
  const parsed = parseMigrationSql(sql);
  assert.deepEqual(parsed.created, ["widgets"]);
  assert.deepEqual(parsed.rlsEnabled, ["widgets"]);
});

test("parseMigrationSql detects RLS targets from array blocks in DO loops", () => {
  const sql = `
    do $$
    declare
      tbl text;
      items text[] := array['client_notes', 'client_visits'];
    begin
      foreach tbl in array items loop
        execute format('alter table public.%I enable row level security', tbl);
      end loop;
    end $$;
  `;
  const parsed = parseMigrationSql(sql);
  assert.ok(parsed.rlsEnabled.includes("client_notes"));
  assert.ok(parsed.rlsEnabled.includes("client_visits"));
});

test("auditMigrationHistory fails when RLS is never enabled", () => {
  const result = auditMigrationHistory([
    {
      name: "20260101000000_create_widgets.sql",
      content: "create table public.widgets (id uuid primary key);",
    },
  ]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].table, "widgets");
});

test("auditMigrationHistory passes when RLS enabled in later migration", () => {
  const result = auditMigrationHistory([
    {
      name: "20260101000000_create_widgets.sql",
      content: "create table public.widgets (id uuid primary key);",
    },
    {
      name: "20260102000000_harden_widgets.sql",
      content: "alter table public.widgets enable row level security;",
    },
  ]);
  assert.equal(result.issues.length, 0);
});

test("auditMigrationFileSameFileRule requires RLS in same file for new creates", () => {
  const issues = auditMigrationFileSameFileRule(
    "20260101000000_create_widgets.sql",
    "create table public.widgets (id uuid primary key);",
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /same file/i);
});

test("full migration history passes RLS lint", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
    .map((name) => ({
      name,
      content: readFileSync(join(dir, name), "utf8"),
    }));
  const result = auditMigrationHistory(files);
  assert.equal(result.issues.length, 0, result.issues.map((i) => i.message).join("\n"));
});
