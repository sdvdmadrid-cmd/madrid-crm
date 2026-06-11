#!/usr/bin/env node
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../load-env-local.mjs";

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

const { rows } = await c.query(`
  SELECT conrelid::regclass AS table_name, confrelid::regclass AS ref_table, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid::regclass::text IN (
      'public.invoices','public.jobs','public.estimates','public.clients','public.bills'
    )
  ORDER BY 1,2
`);
for (const r of rows) console.log(`${r.table_name} -> ${r.ref_table}: ${r.def}`);

await c.end();
