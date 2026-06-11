#!/usr/bin/env node
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../load-env-local.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TID = "8354b6d2-0c6c-4a95-a16d-3bbb6908c943";

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

const tables = [
  "estimate_items",
  "job_daily_reports",
  "email_logs",
  "estimate_revisions",
  "job_cost_entries",
  "job_cost_summaries",
  "job_labor_entries",
  "website_media",
  "bill_payment_remittance_queue",
];

for (const t of tables) {
  try {
    const cols = await c.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t],
    );
    const hasTenant = cols.rows.some((r) => r.column_name === "tenant_id");
    let stage1 = "n/a";
    if (hasTenant) {
      const cnt = await c.query(`SELECT count(*)::int AS n FROM public.${t} WHERE tenant_id = $1`, [TID]);
      stage1 = String(cnt.rows[0].n);
    }
    console.log(`${t}: tenant_id=${hasTenant} stage1=${stage1} cols=${cols.rows.map((r) => r.column_name).join(",")}`);
  } catch (e) {
    console.log(`${t}: ERR ${e.message.split("\n")[0]}`);
  }
}

await c.end();
