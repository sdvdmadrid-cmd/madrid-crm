#!/usr/bin/env node
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../load-env-local.mjs";

const TID = "8354b6d2-0c6c-4a95-a16d-3bbb6908c943";
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

const tables = [
  "contracts","quotes","estimate_builder","contractor_website_leads",
  "contractor_websites","vendors","email_logs","clients","payments","invoices",
];
for (const t of tables) {
  const { rows } = await c.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name='tenant_id'`,
    [t],
  );
  console.log(t, rows[0]?.data_type || "no tenant_id");
}
await c.end();
