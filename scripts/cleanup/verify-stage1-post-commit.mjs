#!/usr/bin/env node
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../load-env-local.mjs";

const STAGE1 = "8354b6d2-0c6c-4a95-a16d-3bbb6908c943";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvLocal(root);
const c = new pg.Client({
  host: "db.fhcbnupmdpphzdafmmgd.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const checks = [
  ["profiles", `SELECT count(*)::int n FROM public.profiles WHERE id = $1::uuid`, [STAGE1]],
  ["company_profiles", `SELECT count(*)::int n FROM public.company_profiles WHERE tenant_id::text = $1`, [STAGE1]],
  ["audit_logs", `SELECT count(*)::int n FROM public.audit_logs WHERE tenant_id::text = $1`, [STAGE1]],
  ["clients", `SELECT count(*)::int n FROM public.clients WHERE tenant_id::text = $1`, [STAGE1]],
];

for (const [label, sql, params] of checks) {
  const { rows } = await c.query(sql, params);
  console.log(`${label}: ${rows[0].n}`);
}

await c.end();
