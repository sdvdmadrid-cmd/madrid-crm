#!/usr/bin/env node
/**
 * Verify Owner Command Center platform metrics match expected real-business totals.
 * Usage: node scripts/cleanup/verify-platform-metrics.mjs
 */
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../load-env-local.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const EXPECT = {
  clients: 65,
  jobs: 0,
  estimates: 9,
  invoices: 1,
  payments: 10,
  contracts: 0,
  invoice_revenue_total: 360,
  madrid_clients: 64,
  madrid_invoices: 1,
  jms_clients: 1,
};

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

const MADRID = "d38fec7b-adac-4b7f-a46d-2ccadab6e452";
const JMS = "ebb368d8-248d-4986-8fdd-56a4da7a33d8";

const tables = ["clients", "jobs", "estimates", "invoices", "payments", "contracts"];
const actual = {};
for (const t of tables) {
  const { rows } = await c.query(`SELECT count(*)::int AS n FROM public.${t}`);
  actual[t] = rows[0].n;
}
const { rows: rev } = await c.query(
  `SELECT coalesce(sum(amount),0)::numeric AS total FROM public.invoices`,
);
actual.invoice_revenue_total = Number(rev[0].total);

const { rows: mc } = await c.query(
  `SELECT count(*)::int AS n FROM public.clients WHERE tenant_id::text = $1`,
  [MADRID],
);
actual.madrid_clients = mc[0].n;
const { rows: mi } = await c.query(
  `SELECT count(*)::int AS n FROM public.invoices WHERE tenant_id::text = $1`,
  [MADRID],
);
actual.madrid_invoices = mi[0].n;
const { rows: jc } = await c.query(
  `SELECT count(*)::int AS n FROM public.clients WHERE tenant_id::text = $1`,
  [JMS],
);
actual.jms_clients = jc[0].n;

let failed = 0;
for (const [k, exp] of Object.entries(EXPECT)) {
  const ok = actual[k] === exp;
  if (!ok) failed += 1;
  console.log(`${ok ? "OK" : "FAIL"} ${k}: ${actual[k]} (expected ${exp})`);
}

await c.end();
if (failed) process.exit(1);
console.log("\n[verify-platform-metrics] All checks passed");
