#!/usr/bin/env node
/** Dry-run each delete step individually (autocommit) to find failing step. */
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../load-env-local.mjs";

const TID = "8354b6d2-0c6c-4a95-a16d-3bbb6908c943";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvLocal(root);

const steps = [
  ["bill_payment_remittance_queue", `DELETE FROM public.bill_payment_remittance_queue WHERE bill_id IN (SELECT id FROM public.bills WHERE tenant_id = $1::uuid)`],
  ["bill_payment_transactions", `DELETE FROM public.bill_payment_transactions WHERE tenant_id = $1::uuid`],
  ["bills", `DELETE FROM public.bills WHERE tenant_id = $1::uuid`],
  ["bill_payment_methods", `DELETE FROM public.bill_payment_methods WHERE tenant_id = $1::uuid`],
  ["bill_payment_customers", `DELETE FROM public.bill_payment_customers WHERE tenant_id = $1::uuid`],
  ["payments", `DELETE FROM public.payments WHERE tenant_id = $1::uuid`],
  ["job_files", `DELETE FROM public.job_files WHERE job_id IN (SELECT id FROM public.jobs WHERE tenant_id = $1::uuid)`],
  ["job_expenses", `DELETE FROM public.job_expenses WHERE tenant_id = $1::uuid`],
  ["job_daily_reports", `DELETE FROM public.job_daily_reports WHERE tenant_id = $1::uuid`],
  ["notifications", `DELETE FROM public.notifications WHERE tenant_id = $1::uuid`],
  ["appointments", `DELETE FROM public.appointments WHERE tenant_id = $1::uuid`],
  ["estimate_revisions", `DELETE FROM public.estimate_revisions WHERE tenant_id = $1::uuid`],
  ["estimate_items", `DELETE FROM public.estimate_items WHERE estimate_id IN (SELECT id FROM public.estimates WHERE tenant_id = $1::uuid)`],
  ["invoices", `DELETE FROM public.invoices WHERE tenant_id = $1::uuid`],
  ["jobs", `DELETE FROM public.jobs WHERE tenant_id = $1::uuid`],
  ["estimates", `DELETE FROM public.estimates WHERE tenant_id = $1::uuid`],
  ["contracts", `DELETE FROM public.contracts WHERE tenant_id = $1::uuid`],
  ["quotes", `DELETE FROM public.quotes WHERE tenant_id = $1::uuid`],
  ["estimate_builder", `DELETE FROM public.estimate_builder WHERE tenant_id = $1::uuid`],
  ["contractor_website_leads", `DELETE FROM public.contractor_website_leads WHERE tenant_id = $1::uuid`],
  ["contractor_websites", `DELETE FROM public.contractor_websites WHERE tenant_id = $1::uuid`],
  ["vendors", `DELETE FROM public.vendors WHERE tenant_id = $1::uuid`],
  ["email_logs", `DELETE FROM public.email_logs WHERE tenant_id = $1::uuid`],
  ["clients", `DELETE FROM public.clients WHERE tenant_id = $1::uuid`],
];

const c = new pg.Client({
  host: "db.fhcbnupmdpphzdafmmgd.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

for (const [label, sql] of steps) {
  try {
    await c.query("BEGIN");
    const res = await c.query(sql, [TID]);
    await c.query("ROLLBACK");
    console.log(`OK ${label}: would delete ${res.rowCount}`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.log(`FAIL ${label}: ${e.message.split("\n")[0]}`);
    break;
  }
}
await c.end();
